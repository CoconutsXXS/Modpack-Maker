let panel = document.getElementById('config-container');

let propContainer = panel.querySelector('button').cloneNode(true); panel.querySelector('button').remove();
let propFloat = panel.querySelector('div[float]').cloneNode(true); panel.querySelector('div[float]').remove();
let propBool = panel.querySelector('div[boolean]').cloneNode(true); panel.querySelector('div[boolean]').remove();
let propString = panel.querySelector('div[string]').cloneNode(true); panel.querySelector('div[string]').remove();
let propComment = panel.querySelector('div[comment]').cloneNode(true); panel.querySelector('div[comment]').remove();
window.configPanel = async function(filename)
{
    panel.innerHTML = '';
    let config = await window.instance.getConfig(filename);

    displayProperties(panel, config, 0, 0, (k, v) => { config[k] = v; console.log(config[k],' = ',v) });
    function displayProperties(p, o, position, decal = 0, onModify = (k, v) => {})
    {        
        let list = [];
        for(let i of Object.keys(o).reverse())
        {
            let cleanI = i.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
            if(o[i].comments)
            {
                for(let com of o[i].comments)
                {
                    let comment = propComment.cloneNode(true); list.push(comment)
                    comment.querySelector('span').innerText = com;
                    p.insertBefore(comment, p.childNodes[position]);
                    comment.style.marginLeft = decal+'px';
                    comment.style.width = `calc(100% - ${decal}px)`;
                    position++
                }        
            }

            switch(typeof(o[i].value)=='undefined'?typeof(o[i]):typeof(o[i].value))
            {
                case 'object':
                {
                    let c = propContainer.cloneNode(true); list.push(c);
                    c.querySelector('h4').innerText = cleanI;
                    p.insertBefore(c, p.childNodes[position]);
                    position++;

                    let object = o[i];

                    let opened = false;
                    let childrenList;
                    let key = i;
                    c.onclick = () =>
                    {
                        opened = !opened;
                        if(opened)
                        {
                            c.querySelector('img').style.rotate = '180deg'
                            childrenList = displayProperties(p, o[key], Array.prototype.indexOf.call(p.childNodes,c)+1, decal+16, (k, v) => { object[k].value = v; onModify(key, object); });
                        }
                        else if(childrenList)
                        {
                            c.querySelector('img').style.rotate = '0deg'
                            for(let c of childrenList) { c.remove(); } childrenList = [];
                        }
                    }

                    c.style.marginLeft = decal+'px';
                    c.style.width = `calc(100% - ${decal}px)`;
                    break;
                }
                case "boolean":
                {
                    let c = propBool.cloneNode(true); list.push(c);
                    p.insertBefore(c, p.childNodes[position]);
                    position++;
                    c.querySelector('span').innerText = cleanI;
                    c.querySelector('label > input').checked = o[i].value;

                    c.onclick = () => c.querySelector('label > input').click();

                    c.querySelector('label > input').oninput = () => {onModify(i, c.querySelector('label > input').checked)}

                    c.style.marginLeft = decal+'px';
                    c.style.width = `calc(100% - ${decal}px)`;
                    break;
                }
                case "number":
                {
                    let c = propFloat.cloneNode(true); list.push(c);
                    p.insertBefore(c, p.childNodes[position]);
                    position++;
                    c.querySelector('span').innerText = cleanI;
                    c.querySelector('input[type="range"]').value = c.querySelector('input[type="text"]').value = o[i].value;

                    c.querySelector('input[type="range"]').oninput = () => {onModify(i, Number(c.querySelector('input[type="range"]').value)); c.querySelector('input[type="text"]').value = Math.round(Number(c.querySelector('input[type="range"]').value)*1000)/1000; }
                    c.querySelector('input[type="text"]').oninput = () => { if(isNaN(Number(c.querySelector('input[type="range"]').value))){return;} onModify(i, Number(c.querySelector('input[type="range"]').value)); c.querySelector('input[type="range"]').value = c.querySelector('input[type="text"]').value; }

                    c.onclick = () => c.querySelector('input[type="text"]').click();

                    c.style.marginLeft = decal+'px';
                    c.style.width = `calc(100% - ${decal}px)`;

                    // Range min-max
                    for(let com of o[i].comments)
                    {
                        if(com.startsWith('Range: ') && com.includes('~'))
                        {
                            c.querySelector('input[type="range"]').min = clamp(Number(com.substring(7, com.indexOf('~'))), -1024, 1024)
                            c.querySelector('input[type="range"]').max = clamp(Number(com.substring(com.indexOf('~')+2, com.length)), -1024, 1024)
                        }
                        else if(com.includes('>'))
                        {
                            c.querySelector('input[type="range"]').min = clamp(Number(com.substring(com.indexOf('>')+2, com.length)), -1024, 1024)
                        }
                    }

                    break;
                }
                case "string":
                {
                    let c = propString.cloneNode(true); list.push(c);
                    p.insertBefore(c, p.childNodes[position]);
                    position++;
                    c.querySelector('span').innerText = cleanI;
                    c.querySelector('input').value = o[i].value;

                    c.onclick = () => c.querySelector('input').click();
                    c.querySelector('input').oninput = () => onModify(i, c.querySelector('input').value)

                    c.style.marginLeft = decal+'px';
                    c.style.width = `calc(100% - ${decal}px)`;
                    break;
                }
            }
        }
        return list;
    }

    document.getElementById('config-options').querySelector('button').onclick = async () =>
    {
        function reconvertToOriginal(i)
        {
            return Object.fromEntries(Object.entries(i).map(([key, val]) =>
            {
                if(val.value == null && typeof(val) == 'object') { return [key, reconvertToOriginal(val)] }
                else if(val.value == null) { return [key, val] }
                else { return [key, val.value] }
            }))
        }

        console.log(config)
        await window.instance.setConfig(filename, config)
    };

    Array.from(document.getElementById('center-panel').childNodes[1].childNodes).find(e=>e.innerText=='Config').click();
}
const clamp = (val, min, max) => Math.min(Math.max(val, min), max)

let ob = new ResizeObserver(() => {panel.style.width = document.getElementById('center-panel').clientWidth+'px'})
ob.observe(document.getElementById('center-panel'))