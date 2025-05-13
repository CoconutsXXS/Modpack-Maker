document.addEventListener('click', event =>
{
    if(event.target.classList.contains('openable-image') && event.target.src != null) { select(event.target); }
})

function select(e)
{
    document.getElementById('image-zoom').querySelector('img').src = e.src;
    document.getElementById('image-zoom').style.display = 'block'

    document.getElementById('image-zoom').querySelector('button[right]').onclick = () =>
    {
        let index;
        let nodes = e.parentNode.querySelectorAll("img");
        nodes.forEach((n, i) =>
        {
            if(n === e) { index = i; }
        })

        let target = nodes[index+1]; if(index >= nodes.length-1) { target = nodes[0]; }
        if(target) { select(target) }
    }
    document.getElementById('image-zoom').querySelector('button[left]').onclick = () =>
    {
        let index;
        let nodes = e.parentNode.querySelectorAll("img");
        nodes.forEach((n, i) =>
        {
            if(n === e) { index = i; }
        })

        let target = nodes[index-1]; if(index == 0) { target = nodes[nodes.length-1]; }
        if(target) { select(target) }
    }
}

document.getElementById('image-zoom').querySelector('button[close]').onclick = () => { document.getElementById('image-zoom').style.display = 'none'; }
document.getElementById('image-zoom').onclick = (e) =>
{
    if(e.target != document.getElementById('image-zoom')){return;}
    document.getElementById('image-zoom').style.display = 'none';
}
document.getElementById('image-zoom').style.display = 'none';