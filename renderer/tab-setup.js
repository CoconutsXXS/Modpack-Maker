// Center Panel Tab
window.setupTab(document.getElementById('center-panel').childNodes[1],
[
    {select: () => {document.getElementById('game-container').style.display = 'block'; }, deselect: () => {document.getElementById('game-container').style.display = 'none';}},
    {select: () => {document.getElementById('console-window').style.display = 'block';}, deselect: () => {document.getElementById('console-window').style.display = 'none';}},
    {select: () => {document.getElementById('class-window').style.display = 'block';}, deselect: () => {document.getElementById('class-window').style.display = 'none';}},
    {select: () => {document.getElementById('web-window').style.display = 'block';}, deselect: () => {document.getElementById('web-window').style.display = 'none';}},
    {select: () => {document.getElementById('youtube-window').style.display = 'block';}, deselect: () => {document.getElementById('youtube-window').style.display = 'none';}},
    {select: () => {document.getElementById('config-panel').style.display = 'grid';}, deselect: () => {document.getElementById('config-panel').style.display = 'none';}},
    {select: () => {document.getElementById('saves-panel').style.display = 'grid';}, deselect: () => {document.getElementById('saves-panel').style.display = 'none';}},
    {select: () => {document.getElementById('content-editor').style.display = 'block';}, deselect: () => {document.getElementById('content-editor').style.display = 'none';}},
], 0);

window.setupTab(document.getElementById('browse-panel').childNodes[1],
[
    {select: () => {document.getElementById('mods-settings').style.display = 'block'; }, deselect: () => {document.getElementById('mods-settings').style.display = 'none';}},
    {select: () => {document.getElementById('resourcepacks-settings').style.display = 'block'; }, deselect: () => {document.getElementById('resourcepacks-settings').style.display = 'none';}},
    {select: () => {document.getElementById('shaders-settings').style.display = 'block'; }, deselect: () => {document.getElementById('shaders-settings').style.display = 'none';}},
    {select: () => {document.getElementById('browse-panel').style.display = 'block'; }, deselect: () => {document.getElementById('browse-panel').style.display = 'none';}},
]);
window.explorerTab = 'mods';
window.setupTab(document.getElementById('bottom-panel').childNodes[1].childNodes[1],
[
    {select: () => {document.getElementById('mods-explorer').style.display = 'flex'; window.explorerTab = 'mods'; }, deselect: () => {document.getElementById('mods-explorer').style.display = 'none';}},
    {select: () => {document.getElementById('rp-explorer').style.display = 'flex'; window.explorerTab = 'resourcepacks'; }, deselect: () => {document.getElementById('rp-explorer').style.display = 'none';}},
    {select: () => {document.getElementById('shaders-explorer').style.display = 'flex'; window.explorerTab = 'shaderpacks'; }, deselect: () => {document.getElementById('shaders-explorer').style.display = 'none';}},
    {select: () => {document.getElementById('bottom-webview-container').style.display = 'block'; }, deselect: () => {document.getElementById('bottom-webview-container').style.display = 'none';}},
    {select: () => {  }, deselect: () => {  }},
    {select: () => { window.importSave(); }, deselect: () => {  }},
]);
window.setupTab(document.getElementById('top-tab'),
[
    {select: () => { window.instance.save(window.instance) }, deselect: () => {}},
    {select: () => { openInstanceSelector() }, deselect: () => {}},
    {select: () => { if(window.instance.save){window.instance.save(window.instance)} openInstanceSelector(); window.close() }, deselect: () => {}},
], 0, false, false, true);