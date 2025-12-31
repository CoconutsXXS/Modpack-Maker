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
    const resizer = rightPanel.querySelector(".resize-hand")

    resizer.onmousedown = (ev) => {mouse=true; startPosition.x = ev.clientX; startPosition.y = ev.clientY; startWidth=rightPanel.getBoundingClientRect().width; ev.preventDefault();}
    document.addEventListener("mouseup", () =>
    {
        mouse=false;startPosition = {x:null,y:null}; startWidth=null;

        if(rightPanel.style.display == "none")
        {
            document.body.appendChild(resizer)
            resizer.style.position = "fixed"
            resizer.style.top = "0"
            resizer.style.right = "0"
            resizer.style.height = "100vh"
            resizer.style.width = "16px"
            resizer.style.zIndex = "5"
            resizer.style.cursor = "w-resize"
        }
        else
        {
            resizer.style.position = 
            resizer.style.top =
            resizer.style.right =
            resizer.style.width = 
            resizer.style.height = 
            resizer.style.zIndex =
            resizer.style.cursor = ""
            rightPanel.appendChild(resizer)
        }
    })

    document.addEventListener("mousemove", (ev) =>
    {
        if(!mouse){return;}
        if(startPosition.x == null || startPosition.y == null)
        { startPosition.x = ev.clientX; startPosition.y = ev.clientY; return; }

        rightPanel.style.width = `${startWidth+(startPosition.x - ev.clientX)}px`
        rightPanel.style.display = startWidth+(startPosition.x - ev.clientX) < 32 ? "none" : "block"

        ev.preventDefault();
    })
}
// Top
{
    let mouse = false;
    let startPosition = {x:null,y:null}
    let startHeight = null;
    const resizer = topPanel.querySelector(".resize-hand")

    resizer.onmousedown = (ev) => {mouse=true; startPosition.x = ev.clientX; startPosition.y = ev.clientY; startHeight=topPanel.getBoundingClientRect().height; ev.preventDefault();}
    document.addEventListener("mouseup", () =>
    {
        mouse=false;startPosition = {x:null,y:null}; startHeight=null;

        if(topPanel.style.display == "none")
        {
            document.body.appendChild(resizer)
            resizer.style.position = "fixed"
            resizer.style.top = "0"
            resizer.style.left = "0"
            resizer.style.width = "100vw"
            resizer.style.height = "16px"
            resizer.style.zIndex = "5"
            resizer.style.cursor = "s-resize"
        }
        else
        {
            resizer.style.position = 
            resizer.style.top =
            resizer.style.left =
            resizer.style.width = 
            resizer.style.height = 
            resizer.style.zIndex =
            resizer.style.cursor = ""
            topPanel.appendChild(resizer)
        }
    })

    document.addEventListener("mousemove", (ev) =>
    {
        if(!mouse){return;}
        if(startPosition.x == null || startPosition.y == null)
        { startPosition.x = ev.clientX; startPosition.y = ev.clientY; return; }

        topPanel.style.height = `${startHeight-(startPosition.y - ev.clientY)}px`
        topPanel.style.display = startHeight-(startPosition.y - ev.clientY) < 32 ? "none" : "block"

        ev.preventDefault();
    })
}
// Bottom
{
    let mouse = false;
    let startPosition = {x:null,y:null}
    let startHeight = null;
    const resizer = bottomPanel.querySelector(".resize-hand")

    resizer.onmousedown = (ev) => {mouse=true; startPosition.x = ev.clientX; startPosition.y = ev.clientY; startHeight=bottomPanel.getBoundingClientRect().height; ev.preventDefault();}
    document.addEventListener("mouseup", () =>
    {
        mouse=false;startPosition = {x:null,y:null}; startHeight=null;
        
        if(bottomPanel.style.display == "none")
        {
            document.body.appendChild(resizer)
            resizer.style.position = "fixed"
            resizer.style.bottom = "0"
            resizer.style.left = "0"
            resizer.style.width = "100vw"
            resizer.style.height = "16px"
            resizer.style.zIndex = "5"
            resizer.style.cursor = "n-resize"
        }
        else
        {
            resizer.style.position = 
            resizer.style.bottom =
            resizer.style.left =
            resizer.style.width = 
            resizer.style.height = 
            resizer.style.zIndex =
            resizer.style.cursor = ""
            bottomPanel.appendChild(resizer)
        }
    })

    document.addEventListener("mousemove", (ev) =>
    {
        if(!mouse){return;}
        if(startPosition.x == null || startPosition.y == null)
        { startPosition.x = ev.clientX; startPosition.y = ev.clientY; return; }

        bottomPanel.style.height = `${startHeight+(startPosition.y - ev.clientY)}px`
        bottomPanel.style.display = startHeight+(startPosition.y - ev.clientY) < 32 ? "none" : "block"

        ev.preventDefault();
    })
}