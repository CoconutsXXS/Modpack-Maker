import * as msgpack from "@msgpack/msgpack";

export class ModpackJar
{
    static get = async function(name, version = null)
    {
        let result = new ModpackJar();
        result.name = name;
        result.data = msgpack.decode(await getCombined(name, version))

        return result
    }

    getFile = async function(keys, multipleResolver = (files) => { return files[0] })
    {
        if(!getProp(this.data, keys))
        {
            let files = await ipcInvoke("retrieveFileByKeys", this.name, keys);
            if(files.length==0){return null;}
            let value = multipleResolver(files);
            setProp(this.data, keys, value)

            return value;
        }
        else
        {
            return getProp(this.data, keys)
        }
    }
    resolveAsset = async function(ref, prefixKeys = [])
    {
        if (!ref) return null;

        // mod_id:models/blocks/a
        let cleaned = ref.replace(/^#/, '');
        let keys = [];
        if (cleaned.includes(':'))
        {
            let [mod, path] = cleaned.split(':');
            path = prefixKeys.concat(path.split("/"));

            path[path.length-1] = path[path.length-1] + ( path[0]=="models"||path[0]=="blockstates"?'.json':(path[0]=="textures"?'.png':'') )

            keys = ['assets', mod].concat(path);
        }
        else
        {
            cleaned = prefixKeys.concat(cleaned.split("/"));
            cleaned[cleaned.length-1] = cleaned[cleaned.length-1] + ( cleaned[0]=="models"||cleaned[0]=="blockstates"?'.json':(cleaned[0]=="textures"?'.png':'') )

            keys = ['assets', "minecraft"].concat(cleaned);
        }

        let targetObject = await this.getFile(keys);
        if(targetObject) { return targetObject.value }
        else
        {
            // console.warn(ref, "asset not found:",keys);
            return null;
        }
    }
    resolveData = async function(ref, prefixKeys = [])
    {
        if (!ref) return null;

        // mod_id:models/blocks/a
        let cleaned = ref.replace(/^#/, '');
        let keys = [];
        if (cleaned.includes(':'))
        {
            let [mod, path] = cleaned.split(':');
            path = prefixKeys.concat(path.split("/"));

            path[path.length-1] = path[path.length-1] + ( path[0]=="structures"?'.nbt':'' )

            keys = ['data', mod].concat(path);
        }
        else
        {
            cleaned = prefixKeys.concat(cleaned.split("/"));
            cleaned[cleaned.length-1] = cleaned[cleaned.length-1] + ( cleaned[0]=="structures"?'.nbt':'' )

            keys = ['data', "minecraft"].concat(cleaned);
        }

        let targetObject = await this.getFile(keys);
        if(targetObject) { return targetObject.value }
        else { console.warn(ref, "asset not found:",keys); return null; }
    }

    name
    data = {}
}

// Object Utilies
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