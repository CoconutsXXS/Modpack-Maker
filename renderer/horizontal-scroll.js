for(let e of document.getElementsByClassName('content-slider'))
{
    let scroll = e.scrollLeft;
    e.addEventListener("wheel", (ev) =>
    {
        scroll += ev.deltaY/3;
        if(scroll < 0){scroll=0;}
        if(scroll > e.scrollWidth){scroll=e.scrollWidth;}
    })

    setInterval(() =>
    {
        if(scroll == e.scrollLeft){return;}
        e.scrollLeft = lerp(e.scrollLeft, scroll, 0.3);
    }, 1000/60)        
}
function lerp(a, b, t) { return a+(b-a)*t; }