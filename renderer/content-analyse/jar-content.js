import * as msgpack from "@msgpack/msgpack";
import _ from "lodash"

export default class JarContent
{
    static get = async function(name, version = null, decompile = false)
    {
        let result = new JarContent();
        result = Object.assign(result, msgpack.decode(await invokePacked("loadInstanceContent", name, version, decompile)))

        // await searchEntities(result)
        
        return result
    }

    name;
    version;
    path;

    elements = {}
    indexer = {}
    hierarchyIndexer = {}

    overrides = {}
    loaded = {}
    modified = {}

    async get(location, resolver = files => files[0])
    {
        if(this.overrides[location]) { return this.overrides[location]; }

        if(this.loaded[location])
        {
            const resolvedOrigin = resolver(Object.keys(this.loaded[location]));
            const r = this.loaded[location]?.[ resolvedOrigin ];

            const modified = this.modified?.[location]?.[ resolvedOrigin ]
            if(modified)
            {
                if(modified.value) { r.value = modified.value }
                if(modified.buffer) { r.buffer = modified.buffer }
            }

            if( r ) {  return r; }
        }

        const r = await fileFromInstance(this.name, location, resolver)

        // Save
        if(!this.loaded[location]) { this.loaded[location] = {} }
        for(const f of r.files)
        {
            if(this.loaded[location]?.[f]) { continue }
            this.loaded[location][f] = null
        }

        if(!r?.file?.origin) { return r.file; }

        this.loaded[location][r.file.origin] = r.file

        return r.file
    }

    // Files
    set(location, source, value, buffer)
    {
        if(!this.modified[location]) { this.modified[location] = {} }

        let type = "add"
        if(this.indexer?.[location] && this.indexer[location].includes(source))
        { type = "modify" }

        this.modified[location][source] =
        {
            type,
            value,
            buffer
        }
    }
    remove(location, source)
    {
        if(!this.modified[location]) { this.modified[location] = {} }
        this.modified[location][source] =
        {
            type: "remove"
        }
    }

    write(origin, files)
    {
        return ipcInvoke('writeInstanceContent', this.name, origin, files)
    }

    // Resolvers
    resolveAsset = async function(ref, prefixKeys = [])
    {
        if (!ref) return null;

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
        
        let targetObject = await this.get(keys.join('/'));
        if(targetObject) { return targetObject.value }
        else { return null; }
    }
    resolveData = async function(ref, prefixKeys = [])
    {
        if (!ref) return null;

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

        let targetObject = await this.get(keys.join('/'));
        if(targetObject) { return targetObject.value }
        else { return null; }
    }
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