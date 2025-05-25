let popupElement = document.getElementById('popup-container');
let popupText = document.getElementById('popup-container').querySelector('p');
let popupButton = document.getElementById('popup-container').querySelector('div:first-of-type > button:first-of-type');

let popupInput = document.getElementById('popup-container').querySelector('input');

popupElement.style.display = 'none'
window.popup = (type = "info", text) =>
{
    return new Promise((resolve) =>
    {
        popupElement.style.display = 'block';
        popupText.innerText = text;
        switch(type)
        {
            case 'info': { popupInput.style.display = 'none'; break; }
            case 'text': { popupInput.style.display = 'block'; popupInput.style.type = 'text'; break; }
        }
        popupButton.onclick = () => { if(type=='text' && popupInput.value==''){return} resolve(popupInput.value); popupElement.style.display = 'none'; }
    });
}