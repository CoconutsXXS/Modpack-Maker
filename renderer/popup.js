let popupElement = document.getElementById('popup-container');
let popupText = document.getElementById('popup-container').querySelector('p');
let cancelButton = document.getElementById('popup-container').querySelector('div:first-of-type > button:last-of-type');
let popupButton = document.getElementById('popup-container').querySelector('div:first-of-type > button:first-of-type');

let popupInput = document.getElementById('popup-container').querySelector('input');

popupElement.style.display = 'none'
window.popup = (type = "info", text, cancelable = false) =>
{
    return new Promise((resolve, reject) =>
    {
        popupElement.style.display = 'block';
        popupText.innerText = text;
        switch(type)
        {
            case 'info': { popupInput.style.display = 'none'; break; }
            case 'text': { popupInput.style.display = 'block'; popupInput.style.type = 'text'; break; }
        }

        cancelButton.style.display = cancelable?"block":"none"
        popupButton.onclick = () => { if(type=='text' && popupInput.value==''){return} resolve(popupInput.value); popupElement.style.display = 'none'; }
        cancelButton.onclick = () => { resolve(0) }
    });
}