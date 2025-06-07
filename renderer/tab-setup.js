// Center Panel Tab
window.setupTab(document.getElementById('center-panel').childNodes[1],
[
    {select: () => {document.getElementById('game-window').style.display = 'block'; }, deselect: () => {document.getElementById('game-window').style.display = 'none';}},
    {select: () => {document.getElementById('console-window').style.display = 'block';}, deselect: () => {document.getElementById('console-window').style.display = 'none';}},
    {select: () => {document.getElementById('class-window').style.display = 'block';}, deselect: () => {document.getElementById('class-window').style.display = 'none';}},
    {select: () => {document.getElementById('web-window').style.display = 'block';}, deselect: () => {document.getElementById('web-window').style.display = 'none';}},
    {select: () => {document.getElementById('youtube-window').style.display = 'block';}, deselect: () => {document.getElementById('youtube-window').style.display = 'none';}},
    {select: () => {document.getElementById('config-panel').style.display = 'grid';}, deselect: () => {document.getElementById('config-panel').style.display = 'none';}},
]);

window.setupTab(document.getElementById('right-panel').childNodes[1],
[
    {select: () => {document.getElementById('general-settings').style.display = 'block'; }, deselect: () => {document.getElementById('general-settings').style.display = 'none';}},
    {select: () => {document.getElementById('mods-settings').style.display = 'block'; }, deselect: () => {document.getElementById('mods-settings').style.display = 'none';}},
    {select: () => {document.getElementById('resourcepacks-settings').style.display = 'block'; }, deselect: () => {document.getElementById('resourcepacks-settings').style.display = 'none';}},
    {select: () => {document.getElementById('shaders-settings').style.display = 'block'; }, deselect: () => {document.getElementById('shaders-settings').style.display = 'none';}},
]);
window.explorerTab = 'mods';
window.setupTab(document.getElementById('bottom-panel').childNodes[1].childNodes[1],
[
    {select: () => {document.getElementById('mods-explorer').style.display = 'flex'; window.explorerTab = 'mods'; }, deselect: () => {document.getElementById('mods-explorer').style.display = 'none';}},
    {select: () => {document.getElementById('rp-explorer').style.display = 'flex'; window.explorerTab = 'resourcepacks'; }, deselect: () => {document.getElementById('rp-explorer').style.display = 'none';}},
    {select: () => {document.getElementById('shaders-explorer').style.display = 'flex'; window.explorerTab = 'shaderpacks'; }, deselect: () => {document.getElementById('shaders-explorer').style.display = 'none';}},
    {select: () => {document.getElementById('bottom-webview-container').style.display = 'block'; }, deselect: () => {document.getElementById('bottom-webview-container').style.display = 'none';}},
]);
window.setupTab(document.getElementById('top-tab'),
[
    {select: () => { window.instance.save(window.instance) }, deselect: () => {}},
    {select: () => { console.log(openInstanceSelector); openInstanceSelector() }, deselect: () => {}},
    {select: () => { window.close() }, deselect: () => {}},
], 0, false, false, true);