let container = document.getElementById("background-tasks")

class BackgroundEvent
{
    div; span; img
    constructor(text, icon = null)
    {
        this.div = document.createElement("div")
        this.span = document.createElement("span")
        this.div.appendChild(this.span)
        this.img = document.createElement("img")
        this.div.appendChild(this.img)

        this.span.innerText = text;
        if(icon) { this.img.src = icon; }
        else { this.img.style.display = 'none'; }

        container.appendChild(this.div)
    }

    lastProgress = 0
    update(p)
    {
        this.lastProgress = p
        this.div.style.backgroundPosition = `-${this.div.getBoundingClientRect().width*(1-p)}px 0`
    }

    delete()
    {
        this.div.style.backgroundPosition = `2px 0`
        setTimeout(() =>
        {
            this.div.remove()
        }, 400)
    }
}

window.BackgroundEvent = BackgroundEvent