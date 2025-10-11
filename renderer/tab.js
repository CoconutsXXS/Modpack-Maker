window.setupTab = function setupTab(tab, events, defaultIndex = 0, multi = false, allDefault = false, ephemeral = false)
{
    var i = 0;
    let unselect = function(){};
    let unselectAttr = function(){};
    for(let b of tab.childNodes)
    {
        if(b.nodeName != 'BUTTON'){continue;}
        let index = i;
        b.addEventListener('click', () =>
        {
            if(ephemeral){events[index].select();return}
            unselect(); unselectAttr();

            if(!multi)
            {
                unselect = events[index].deselect;
                unselectAttr = () => b.setAttribute('current', 'false');
                b.setAttribute('current', 'true');
                events[index].select();
            }
            else
            {
                if(b.getAttribute('current') == 'true')
                {
                    b.setAttribute('current', 'false');
                    events[index].deselect();
                }
                else
                {
                    b.setAttribute('current', 'true');
                    events[index].select();
                }
            }
        });

        if((defaultIndex == index || (allDefault && multi)) && !ephemeral)
        {
            events[index].select();
            unselect(); unselectAttr();

            if(!multi)
            {
                unselect = events[index].deselect;
                unselectAttr = () => b.setAttribute('current', 'false');    
            }

            b.setAttribute('current', 'true');
        }
        else { b.setAttribute('current', 'false'); if(events[index]?.deselect!=undefined) { events[index]?.deselect(); } }

        i++;
    }
}