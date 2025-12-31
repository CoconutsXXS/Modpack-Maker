let infoElement = document.getElementById('hover-info');
let topOfCursor = false;

window.loadHoverInfo = () =>
{
    for(let e of Array.from(document.getElementsByTagName('*')).filter(c =>{return c.getAttribute('hover-info')!=null}))
    {
        e.addEventListener('mousemove', (ev) =>
        {
            topOfCursor=false
            infoElement.style.opacity = '1';
            infoElement.innerText = e.getAttribute('hover-info')
            e.style.cursor = 'none';
        })
        e.addEventListener('mouseleave', (e) =>
        {
            infoElement.style.opacity = '0';
        })
    }
    for(let e of Array.from(document.getElementsByTagName('*')).filter(c =>{return c.getAttribute('soft-hover-info')!=null}))
    {
        e.addEventListener('mousemove', (ev) =>
        {
            topOfCursor=true
            infoElement.style.opacity = '0.8';
            infoElement.innerText = e.getAttribute('soft-hover-info')
        })
        e.addEventListener('mouseleave', (e) =>
        {
            infoElement.style.opacity = '0';
        })
    }
}
window.addEventListener('DOMContentLoaded', window.loadHoverInfo)
window.loadHoverInfo()

document.addEventListener('mousemove', (ev) =>
{
    let mousePosition = {x: ev.clientX+document.documentElement.scrollLeft-document.body.clientLeft, y: ev.clientY+document.documentElement.scrollTop-document.body.clientTop}
    infoElement.style.left = mousePosition.x+'px';
    infoElement.style.top = (mousePosition.y+(topOfCursor?-infoElement.getBoundingClientRect().height:0))+'px';
})