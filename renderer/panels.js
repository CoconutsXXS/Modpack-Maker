// // Pannels Resize
const centerPanel = document.getElementById('center-panel');
const topPanel = document.getElementById('top-panel');
const bottomPanel = document.getElementById('bottom-panel');
const leftPanel = document.getElementById('left-panel');
const rightPanel = document.getElementById('right-panel');


let lastCenterRect = null;
resizeVerticalPanel()
function resizeVerticalPanel()
{
    var topHeight = topPanel.getBoundingClientRect().height;
    var bottomHeight = bottomPanel.getBoundingClientRect().height;
    var leftWidth = leftPanel.getBoundingClientRect().width;
    var rightWidth = rightPanel.getBoundingClientRect().width;

    leftPanel.style.top = rightPanel.style.top = topHeight+"px";
    leftPanel.style.height = "calc(100vh - "+(bottomHeight+topHeight)+"px)";

    rightPanel.style.height = "calc(100vh - "+topHeight+"px)";
    bottomPanel.style.width = "calc(100vw - "+rightWidth+"px)";

    centerPanel.style.left = leftWidth+'px';
    centerPanel.style.top = topHeight+'px';
    centerPanel.style.width = (window.innerWidth-leftWidth-rightWidth)+'px'
    centerPanel.style.height = (window.innerHeight-topHeight-bottomHeight)+'px'

    if(centerPanel.getBoundingClientRect() != lastCenterRect && window.oncenterpanelresize) { lastCenterRect = centerPanel.getBoundingClientRect(); window.oncenterpanelresize(lastCenterRect); }
}

let observer = new ResizeObserver(resizeVerticalPanel);
observer.observe(centerPanel)
observer.observe(leftPanel)
observer.observe(rightPanel)
observer.observe(topPanel)
observer.observe(bottomPanel)
window.onresize = resizeVerticalPanel;

// Resize Hands
// Right
{
    let mouse = false;
    let startPosition = {x:null,y:null}
    let startWidth = null;
    rightPanel.querySelector(".resize-hand").onmousedown = (ev) => {mouse=true; startPosition.x = ev.clientX; startPosition.y = ev.clientY; startWidth=rightPanel.getBoundingClientRect().width; ev.preventDefault();}
    document.addEventListener("mouseup", () => {mouse=false;startPosition = {x:null,y:null}; startWidth=null;})

    document.addEventListener("mousemove", (ev) =>
    {
        if(!mouse){return;}
        if(startPosition.x == null || startPosition.y == null)
        { startPosition.x = ev.clientX; startPosition.y = ev.clientY; return; }

        rightPanel.style.width = `${startWidth+(startPosition.x - ev.clientX)}px`

        ev.preventDefault();
    })
}
// Top
{
    let mouse = false;
    let startPosition = {x:null,y:null}
    let startHeight = null;
    topPanel.querySelector(".resize-hand").onmousedown = (ev) => {mouse=true; startPosition.x = ev.clientX; startPosition.y = ev.clientY; startHeight=topPanel.getBoundingClientRect().height; ev.preventDefault();}
    document.addEventListener("mouseup", () => {mouse=false;startPosition = {x:null,y:null}; startHeight=null;})

    document.addEventListener("mousemove", (ev) =>
    {
        if(!mouse){return;}
        if(startPosition.x == null || startPosition.y == null)
        { startPosition.x = ev.clientX; startPosition.y = ev.clientY; return; }

        console.log(startHeight, (startPosition.y - ev.clientY))
        topPanel.style.height = `${startHeight-(startPosition.y - ev.clientY)}px`

        ev.preventDefault();
    })
}
// Bottom
{
    let mouse = false;
    let startPosition = {x:null,y:null}
    let startHeight = null;
    bottomPanel.querySelector(".resize-hand").onmousedown = (ev) => {mouse=true; startPosition.x = ev.clientX; startPosition.y = ev.clientY; startHeight=bottomPanel.getBoundingClientRect().height; ev.preventDefault();}
    document.addEventListener("mouseup", () => {mouse=false;startPosition = {x:null,y:null}; startHeight=null;})

    document.addEventListener("mousemove", (ev) =>
    {
        if(!mouse){return;}
        if(startPosition.x == null || startPosition.y == null)
        { startPosition.x = ev.clientX; startPosition.y = ev.clientY; return; }

        bottomPanel.style.height = `${startHeight+(startPosition.y - ev.clientY)}px`

        ev.preventDefault();
    })
}