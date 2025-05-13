setInterval(() =>
{
    if(document.getElementById('button-download-version-select') == undefined) { modify(); }
}, 1000/60);

function modify()
{
    document.querySelector('div.hidden:nth-child(1) > div:nth-child(1) > button:nth-child(1)').onclick = async (e) =>
    {
        e.preventDefault();
        window.electron.sendToHost('download', {});
        if(document.querySelector("#__nuxt > div.layout > main > div.experimental-styles-within > div:nth-child(4)"))
        { document.querySelector("#__nuxt > div.layout > main > div.experimental-styles-within > div:nth-child(4)").style.display = 'none' }
    }
    document.querySelector('div.hidden:nth-child(1) > div:nth-child(1) > button:nth-child(1)').style.display = 'none';

    // Add new buttons
    if(!document.getElementById('button-download'))
    {
        let c = document.querySelector('div.hidden:nth-child(1) > div:nth-child(1) > button:nth-child(1)').cloneNode(true);
        c.innerHTML = 'Add'
        c.id = 'button-download';
        c.style.display = 'block'
        document.querySelector('div.hidden:nth-child(1) > div:nth-child(1)').appendChild(c);

        let style = document.createElement('style');
        style.innerHTML = 
        `#button-download
        {
            align-items: center;
            background-color: var(--_hover-bg);
            border: 2px solid transparent;
            border-radius: var(--_radius);
            color: var(--_text);
            cursor: pointer;
            display: flex;
            flex-direction: row;
            font-weight: var(--_font-weight);
            gap: var(--_gap);
            height: var(--_height);
            justify-content: center;
            min-width: var(--_width);
            padding: var(--_padding-y) var(--_padding-x);
            transition: scale .125s ease-in-out, background-color .25s ease-in-out, color .25s ease-in-out;
            white-space: nowrap;
        }
        #button-download:hover
        {
            color: var(--_hover-text);
            --tw-brightness: brightness(var(--hover-brightness));
            filter: var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow);
        }`
        document.head.appendChild(style);

        c.onclick = async (e) =>
        {
            e.preventDefault();
            window.electron.sendToHost('download', {});
            if(document.querySelector("#__nuxt > div.layout > main > div.experimental-styles-within > div:nth-child(4)"))
            { document.querySelector("#__nuxt > div.layout > main > div.experimental-styles-within > div:nth-child(4)").style.display = 'none' }
        }
    }    
    if(!document.getElementById('button-download-version-select'))
    {
        let c = document.querySelector('div.hidden:nth-child(1) > div:nth-child(1) > button:nth-child(1)').cloneNode(true);
        c.innerHTML = 'Previous Versions'
        c.id = 'button-download-version-select';
        c.style.display = 'block'
        document.querySelector('div.hidden:nth-child(1) > div:nth-child(1)').appendChild(c);

        let style = document.createElement('style');
        style.innerHTML = 
        `#button-download-version-select
        {
            align-items: center;
            background-color: #da895b;
            border: 2px solid transparent;
            border-radius: var(--_radius);
            color: var(--_text);
            cursor: pointer;
            display: flex;
            flex-direction: row;
            font-weight: var(--_font-weight);
            gap: var(--_gap);
            height: var(--_height);
            justify-content: center;
            min-width: var(--_width);
            padding: var(--_padding-y) var(--_padding-x);
            transition: scale .125s ease-in-out, background-color .25s ease-in-out, color .25s ease-in-out;
            white-space: nowrap;
        }
        #button-download-version-select:hover
        {
            color: var(--_hover-text);
            --tw-brightness: brightness(var(--hover-brightness));
            filter: var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow);
        }`
        document.head.appendChild(style);

        c.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('version-select', {}); }
    }
    if(!document.getElementById('button-quick-test'))
    {
        let c = document.querySelector('div.hidden:nth-child(1) > div:nth-child(1) > button:nth-child(1)').cloneNode(true);
        c.innerHTML = 'Quick Test'
        c.id = 'button-quick-test';
        c.style.display = 'block'
        document.querySelector('div.hidden:nth-child(1) > div:nth-child(1)').appendChild(c);

        let style = document.createElement('style');
        style.innerHTML = 
        `#button-quick-test
        {
            align-items: center;
            background-color: #7984e6;
            border: 2px solid transparent;
            border-radius: var(--_radius);
            color: var(--_text);
            cursor: pointer;
            display: flex;
            flex-direction: row;
            font-weight: var(--_font-weight);
            gap: var(--_gap);
            height: var(--_height);
            justify-content: center;
            min-width: var(--_width);
            padding: var(--_padding-y) var(--_padding-x);
            transition: scale .125s ease-in-out, background-color .25s ease-in-out, color .25s ease-in-out;
            white-space: nowrap;
        }
        #button-quick-test:hover
        {
            color: var(--_hover-text);
            --tw-brightness: brightness(var(--hover-brightness));
            filter: var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow);
        }`
        document.head.appendChild(style);

        c.onclick = async (e) => { e.preventDefault(); window.electron.sendToHost('quick-test', {}); }
    }
    
    document.querySelector("#__nuxt > div.layout > main > div.experimental-styles-within > div.new-page.sidebar > div.normal-page__header.relative.my-4 > div > div.flex.flex-wrap.gap-2.items-center > div.hidden.sm\\:contents > div > button").childNodes[1].data = 'Add'
}
try{modify()}catch(err){console.error(err)}
document.body.onloadeddata = document.body.onload = document.body.onloadstart = window.onloadeddata = window.onloadedmetadata = modify;

history.replaceState = function(state, title, url)
{
    console.log('replaceState:', state, title, url);
    return handleNavigation(state, title, url);
};
function handleNavigation(state, title, url)
{
    let futurUrl = window.location.origin+state.forward;
    if(futurUrl == window.originalLocation || futurUrl == window.originalLocation+'/changelog' || futurUrl == window.originalLocation+'/gallery' || state.forward == null)
    { try{modify()}catch(err){console.error(err)} return }

    console.log('prevent, load back:',window.location.origin+state.current)
    window.location.assign(window.location.origin+state.current);
    modify();
    return null;
}