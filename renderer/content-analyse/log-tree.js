import * as lodash from "lodash-es"

export default async function logTree(tree, script)
{
    const obj = {}

    function walk(node, keys = [])
    {
        if (!node) return;

        keys.push(node.type)

        let index = 0;
        while(getProp(obj, keys))
        {
            index++;
            keys[keys.length-1] = node.type+'-'+index
        }

        if(node.namedChildCount == 0)
        {
            setProp(obj, keys, script.slice(node.startIndex, node.endIndex))
        }
        else
        {
            setProp(obj, keys, {})

            for (let i = node.namedChildCount; i >= 0; i--)
            {
                const keysCopy = lodash.clone(keys);
                walk(node.namedChild(i), keysCopy);
            }
        }
    }

    walk(tree.rootNode);
    console.log(obj)
}

function getProp(obj, keys)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) return undefined;
        current = current[k];
    });
    return current[keys[keys.length - 1]]
}
function setProp(obj, keys, value)
{
    let current = obj;
    keys.slice(0, -1).forEach(k =>
    {
        if (!(k in current)) current[k] = {};
        current = current[k];
    });
    current[keys[keys.length - 1]] = value;
}