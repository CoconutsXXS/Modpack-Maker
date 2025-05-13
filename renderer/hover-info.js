let infoElement = document.getElementById('hover-info');

window.loadHoverInfo = () =>
{
    for(let e of Array.from(document.getElementsByTagName('*')).filter(c =>{return c.getAttribute('hover-info')!=null}))
    {
        e.addEventListener('mousemove', (ev) =>
        {
            infoElement.style.opacity = '1';
            infoElement.innerText = e.getAttribute('hover-info')
            e.style.cursor = 'none';
        })
        e.addEventListener('mouseleave', (e) =>
        {
            infoElement.style.opacity = '0';
        })
    }
}
window.addEventListener('DOMContentLoaded', window.loadHoverInfo)

document.addEventListener('mousemove', (ev) =>
{
    let mousePosition = {x: ev.clientX+document.documentElement.scrollLeft-document.body.clientLeft, y: ev.clientY+document.documentElement.scrollTop-document.body.clientTop}
    infoElement.style.left = mousePosition.x+'px';
    infoElement.style.top = mousePosition.y+'px';
})