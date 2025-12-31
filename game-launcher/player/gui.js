import Item from "../world/item"

export default class GUI
{
    jarContent
    scale = 1
    container = document.createElement("div")
    enabled = true

    constructor(jarContent, scale = 2)
    {
        this.jarContent = jarContent
        this.scale = scale

        // Container
        this.container.style.position = 'absolute'
        this.container.style.left = '0'
        this.container.style.top = '0'
        this.container.style.width = '100%'
        this.container.style.height = '100%'
        this.container.style.pointerEvents = 'none'
        this.container.style.background = 'transparent'
        this.container.style.padding = '0'

        // Hotbar
        this.hotbar.style.position = 'absolute'
        this.hotbar.style.display = 'flex'
        this.hotbar.style.left = '50%'
        this.hotbar.style.translate = '-50%'
        this.hotbar.style.bottom = '0'
        this.hotbar.style.backgroundSize = `${256/182 * 100}%`
        this.hotbar.style.imageRendering = 'pixelated'
            
        this.hotbar.style.padding = this.scale+'px'
        this.hotbar.style.width = 180*this.scale + 'px'
        this.hotbar.style.height = 20*this.scale + 'px'
        this.container.appendChild(this.hotbar)

        // Outline
        this.hotbarOutline.style.position = "absolute"
        this.hotbarOutline.style.left = this.scale + 'px'
        this.hotbarOutline.style.width = 24*this.scale + 'px'
        this.hotbarOutline.style.height = 24*this.scale + 'px'
        this.hotbarOutline.style.margin = -2*this.scale + 'px'
        this.hotbarOutline.style.backgroundRepeat = 'no-repeat'
        this.hotbarOutline.style.backgroundSize = `${256/24 * 100}%`
        this.hotbarOutline.style.backgroundPosition = `-${0}px -${22*this.scale}px`
        this.hotbar.appendChild(this.hotbarOutline)

        this.jarContent.resolveAsset('minecraft:textures/gui/widgets').then(r => { this.hotbarOutline.style.backgroundImage = this.hotbar.style.backgroundImage = `url(data:image/png;base64,${r})` })

        // Slots
        for (let i = 0; i < 9; i++)
        {
            const slot = document.createElement("div");
            slot.style.width = 16*this.scale + 'px'
            slot.style.height = 16*this.scale + 'px'
            slot.style.margin = 2*this.scale+'px'
            slot.style.backgroundRepeat = 'no-repeat'
            slot.style.backgroundSize = 'cover'

            this.slots[i] = slot
            this.hotbar.appendChild(slot)
        }

        document.addEventListener("wheel", (ev) =>
        {
            if(!this.enabled){return}

            if(ev.deltaY > 0)
            {
                this.selectedSlot++;
                this.selectSlot()
            }
            else if(ev.deltaY < 0)
            {
                this.selectedSlot--;
                this.selectSlot()
            }
        })

        // Crosshair
        this.crosshair.style.width = this.crosshair.style.height = this.scale*16+'px'
        this.crosshair.style.position = 'absolute'
        this.crosshair.style.left = this.crosshair.style.top = '50%'
        this.crosshair.style.translate = '-50% -50%'
        this.crosshair.style.backgroundSize = 100*(256/16)+'%'
        this.crosshair.style.imageRendering = 'pixelated'
        this.jarContent.resolveAsset('minecraft:textures/gui/icons').then(r => { this.crosshair.style.backgroundImage = `url(data:image/png;base64,${r})` })
        this.container.appendChild(this.crosshair)
    }

    // Crosshair
    crosshair = document.createElement("div")

    // Hotbar
    hotbar = document.createElement("div")
    hotbarOutline = document.createElement("div")
    slots = new Array(10)

    slotsData = new Array(10)
    selectedSlot = 0
    onSelectHotbar = (index) => {  }

    async setSlot(index, item, renderer = null)
    {
        this.slotsData[index] = item
        if(!item){return}

        let i = await Item.from(item, this.jarContent);
        if(!i) { console.warn("Item", item, "not found"); return; }

        this.slots[index].style.backgroundImage = `url(${await i.display('gui', 16*this.scale, 16*this.scale, renderer)})`
    }
    selectSlot(index = this.selectedSlot)
    {
        this.selectedSlot = ((index % 9) + 9) % 9;
        this.hotbarOutline.style.left = (20*this.scale*this.selectedSlot+this.scale) + 'px'
        this.onSelectHotbar(this.selectedSlot)
    }
}