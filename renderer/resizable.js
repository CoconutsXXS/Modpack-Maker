window.setResizable = (el, sides = [], events = []) =>
{
    let mouse = false;
    let startPosition = {x:null,y:null}
    
    for(const side of sides)
    {
        let startWidth = null;

        if(!el.querySelector(".resize-hand-"+side))
        {
            const hand = document.createElement("div")
            hand.className = "resize-hand-"+side

            hand.style.position = "sticky"
            hand.style[side == "bottom" ? "bottom" : "top"] = "0"
            hand.style[side == "left" ? "left" : "right"] = "0"
            hand.style[(side == "right" || side == "left") ? "minHeight" : "minWidth"] = "100%"
            hand.style[(side == "right" || side == "left") ? "minWidth" : "minHeight"] = "8px"
            hand.style.cursor = (side == "right" || side == "left") ? "ew-resize" : "ns-resize"
            if(side == "right") { hand.style.marginLeft = '-8px' }
            if(side == "top") { hand.style.marginBottom = '-8px' }
            hand.style.zIndex = "1"
            switch(side)
            {
                case "top": { hand.style.borderBottom = "solid 1px #7373ff50";  break; }
                case "bottom": { hand.style.borderTop = "solid 1px #7373ff50"; break; }
                case "left": { hand.style.borderRight = "solid 1px #7373ff50"; break; }
                case "right": { hand.style.borderLeft = "solid 1px #7373ff50"; break; }
            }


            el.style.position = "relative"
            el.appendChild(hand)
        }

        el.querySelector(".resize-hand-"+side).onmousedown = (ev) =>
        {
            mouse=true;
            startPosition.x = ev.clientX;
            startPosition.y = ev.clientY;

            startWidth=el.getBoundingClientRect()[(side == "right" || side == "left") ? "width" : "height"];
            ev.preventDefault();
        }
        document.addEventListener("mouseup", () => { mouse=false; startPosition = {x:null,y:null}; startWidth=null; el.style.width = el.getBoundingClientRect().width; el.style.heigth = el.getBoundingClientRect().height; })

        document.addEventListener("mousemove", (ev) =>
        {
            if(!mouse){return;}
            if(startPosition.x == null || startPosition.y == null)
            { startPosition.x = ev.clientX; startPosition.y = ev.clientY; return; }

            switch(side)
            {
                case "top": { el.style.heigth = `${startWidth+(startPosition.y - ev.clientY)}px`; break; }
                case "bottom": { el.style.heigth = `${startWidth-(startPosition.y - ev.clientY)}px`; break; }
                case "left": { el.style.width = `${startWidth+(startPosition.x - ev.clientX)}px`; break; }
                case "right": { el.style.width = `${startWidth-(startPosition.x - ev.clientX)}px`; break; }
            }

            ev.preventDefault();
        })
    }

    // Events
    let lastWidth = 0
    let lastHeight = 0
    const observer = new ResizeObserver(() =>
    {
        const width = el.getBoundingClientRect().width
        const height = el.getBoundingClientRect().height

        for(const ev of events)
        {
            if( ( (ev.toWidth || ev.fromWidth) && (!ev.toWidth || (ev.toWidth <= lastWidth && ev.toWidth > width)) && (!ev.fromWidth || (ev.fromWidth >= lastWidth && ev.fromWidth < width)) ) ||
                ( (ev.toHeight || ev.fromHeight) && (!ev.toHeight || (ev.toHeight <= lastHeight && ev.toHeight > height)) && (!ev.fromHeight || (ev.fromHeight >= lastHeight && ev.fromHeight < height)) ) )
            {
                ev.callback(width, height)
            }
        }

        lastWidth = width;
        lastHeight = height
    });
    observer.observe(el)

}