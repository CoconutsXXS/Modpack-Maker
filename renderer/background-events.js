let container = document.getElementById("background-tasks")

class BackgroundEvent
{
    div; span; img
    constructor(text, icon)
    {
        this.div = document.createElement("div")
        this.span = document.createElement("span")
        this.div.appendChild(this.span)
        this.img = document.createElement("img")
        this.div.appendChild(this.img)

        this.span.innerText = text;
        this.img.src = icon;

        container.appendChild(this.div)
    }

    update(p)
    {
        console.log(p)
        this.div.style.backgroundPosition = `-${this.div.getBoundingClientRect().width*(1-p)}px 0`
    }

    delete()
    {
        this.div.style.backgroundPosition = `2px 0`
        setTimeout(() =>
        {
            this.div.remove()
            delete this
        }, 200)
    }
}

window.BackgroundEvent = BackgroundEvent