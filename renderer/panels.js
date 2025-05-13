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