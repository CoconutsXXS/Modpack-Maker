import Block from './block'
import * as lodash from "lodash-es"

export default class Item
{
    name = ""
    data
    sourceJar

    isBlock = false;
    block = null

    static async from(id, sourceJar)
    {
        let result = new Item()
        result.name = id
        result.sourceJar = sourceJar;

        let data = JSON.parse(await sourceJar.resolveAsset(id, ['models', 'item']))

        if(!data){ return null }
        
        // Parent heritage
        while(data.parent != undefined)
        {
            let parent = data.parent;

            // Block
            if(parent.split(':')?.[1]?.split('/')?.[0] == 'block')
            {
                result.isBlock = true;
                result.block = parent.split(':')[0]+':'+parent.split(':')[1].slice(parent.split(':')[1].indexOf('/')+1, parent.split(':')[1].length)
                break;
            }

            let parentObj = JSON.parse(await sourceJar.resolveAsset(parent, ['models']));

            if(!parentObj) { console.warn(id, "item parent \"", parent, "\" not found"); break; }

            let nextParent = parentObj.parent;

            data = lodash.merge(parentObj, data);

            if(parent == nextParent) { data.parent = undefined }
            else { data.parent = nextParent; }
        }

        result.data = data
        return result
    }

    async display(display = "gui", width = 64, height = 64, renderer = null)
    {
        if(this.data.gui_light == 'front')
        {
            const icon = await this.sourceJar.resolveAsset(this.data.textures["layer0"], ['textures'])
            if(!icon){return null}

            // Resize
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            const img = new Image(width, height)

            return new Promise(resolve =>
            {
                img.onload = () =>
                {
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL())
                }

                img.src = 'data:image/png;base64,'+icon.url
            })
        }
        else if(this.isBlock && this.block)
        {
            const model = await Block.from(this.block, {axis: "y", waterlogged: false, type: "bottom"}, this.sourceJar,)

            return await model.display(display, width, height, renderer)
        }

        return null
    }
}