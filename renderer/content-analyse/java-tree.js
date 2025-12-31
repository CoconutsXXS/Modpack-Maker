import { Parser, Language } from 'web-tree-sitter';
import * as lodash from "lodash-es"

let parser = null
export async function toRawTree(script)
{
    if(!parser)
    {
        await Parser.init();
        const wasmPath = await ipcInvoke("appDir") + sep() + 'node_modules/tree-sitter-wasms/out/tree-sitter-java.wasm';
        const Java = await Language.load(wasmPath);
        parser = new Parser();
        parser.setLanguage(Java);
    }
    return await parser.parse(script)
}

export default class JavaTree
{
    static async from(text)
    {
        const tree = await toRawTree(text);
        const result = new JavaTree()
        result.text = text

        function walk(node, keys = [])
        {
            if (!node) return;

            const element =
            {
                node,
                type: node.type,
                content: node.namedChildCount == 0 ? node.text : [],
                get: node.namedChildCount > 0 ? (type, index = 0) =>
                {
                    return element.content.filter(c=>c.type==type)?.[index]
                } : () => null,
                getAll: node.namedChildCount > 0 ? (type) =>
                {
                    return element.content.filter(c=>c.type==type)
                } : () => null,
                totalContent: node.text,
                walk: (callback, key = []) =>
                {
                    key.push("content")

                    for (let i = 0; i < element.content.length; i++)
                    {
                        const c = element.content[i];
                        if(typeof c == "string"){continue}

                        const subKey = lodash.clone(key)
                        subKey.push(i)

                        let end = false;
                        callback(c, subKey, ()=>{end=true});
                        if(end){return;break;}

                        c.walk(callback, subKey)
                    }
                }
            }

            pushProp(result.content, keys, element)
            if(node.namedChildCount == 0) { return }

            keys.push(getProp(result.content, keys).length-1)
            keys.push('content')

            for (let i = 0; i < node.namedChildCount; i++)
            {
                const keysCopy = lodash.clone(keys);
                walk(node.namedChild(i), keysCopy);
            }
        }

        walk(tree.rootNode);
        result.content = result.content[0].content
        return result;
    }

    async loadDependencies(sourceJar)
    {
        await this.walk(async c =>
        {
            if(c.type == "import_declaration" && c.get("scoped_identifier"))
            {
                const keys = []
                let last = c.get("scoped_identifier");
                while(last.get("identifier"))
                {
                    for(const i of last.getAll("identifier").reverse())
                    { keys.push(i.content) }
                    last = last.get("scoped_identifier");
                    if(!last){break}
                }

                keys.reverse()
                const className = keys[keys.length-1];
                keys[keys.length-1] = keys[keys.length-1]+'.class'

                const script = (await sourceJar.getFile(keys))?.value;

                const value =
                {
                    className,
                    path: keys,
                    script
                }

                this.dependencies.push(value)
            }
        })
    }

    text;
    content = []
    dependencies = []

    async walk(callback)
    {
        const key = []
        key.push("content")

        for (let i = 0; i < this.content.length; i++)
        {
            const c = this.content[i];

            const subKey = lodash.clone(key)
            subKey.push(i)
            await callback(c, subKey);

            c.walk(callback, subKey)
        }
    }
}

function getProp(obj, keys)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) return undefined;
        current = current[k];
    });

    if(!keys[keys.length - 1])
    {
        return current
    }
    return current[keys[keys.length - 1]]
}
function pushProp(obj, keys, value)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) current[k] = {};
        current = current[k];
    });

    if(!keys[keys.length - 1])
    {
        current.push(value);
        return;
    }
    current[keys[keys.length - 1]].push(value);
}