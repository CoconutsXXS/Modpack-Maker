import _ from "lodash"
import Block from "./world/block"
import Item from "./world/item"

export default class Extension
{
    id = ""
    sourceJar = {}

    async block(properties = {}, jar, capacity = 32)
    {
        // jar.combined = _.assign(jar.combined, this.sourceJar)
        return await Block.from(this.id, properties, jar, capacity)
    }
    async item(jar)
    {
        // jar.combined = _.assign(jar.combined, this.sourceJar)
        return await Item.from(this.id, jar)
    }

    static async load(id, jar)
    {
        const path = [await ipcInvoke("appDir"), 'game-launcher', 'extensions', id].join(sep())
        const content = await ipcInvoke('readDirectory', path)

        for(const c of content)
        {
            if(c.startsWith("assets/"))
            {
                const keys = c.split("/")
                keys.shift()

                const location = `assets/${id}+${c}`;
                const file = await ipcInvoke("parseFile", path + sep() + c)
                jar.overrides[`assets/${id}+${c}`] = 
                {
                    entry: null,
                    buffer: file.buffer,
                    origin: null,
                    path: location,
                    value: file.value
                }
                // setProp(jar.combined, ['assets', id, ...keys], {value: await ipcInvoke("parseFile", path + sep() + c)})
            }
        }

        return jar;
    }
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