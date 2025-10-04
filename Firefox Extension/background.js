const port = browser.runtime.connectNative("modpack_maker");
port.onMessage.addListener(response =>
{
    // console.log(response);
});
port.onDisconnect.addListener(() =>
{
    browser.tabs.create({ url: browser.runtime.getURL("modpack-maker-disconnected.html") });
    
    console.error(browser.runtime.lastError);
    if (browser.runtime.lastError) { reject(browser.runtime.lastError)};
});


browser.runtime.onMessage.addListener((msg, sender) =>
{
    console.log(msg.action)
    if (msg.action === "app")
    {
        return new Promise((resolve, reject) =>
        {
            try
            {
                console.log(msg)
                port.postMessage(msg.content);


                let received = [];
                let expected = null;

                let listener = port.onMessage.addListener(response =>
                {
                    try
                    {
                        const { index, total, base64 } = response;
                        if (expected === null)
                        {
                            expected = total;
                            received = new Array(total);
                        }

                        const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                        received[index] = binary;

                        if (received.every(Boolean) && total==received.length)
                        {
                            const size = received.reduce((s, a) => s + a.length, 0);
                            const full = new Uint8Array(size);
                            let offset = 0;
                            for (const arr of received)
                            {
                                if(!arr){return;}
                                full.set(arr, offset);
                                offset += arr.length;
                            }
                            const result = JSON.parse(new TextDecoder("utf-8").decode(full));

                            port.onMessage.removeListener(listener);
                            resolve(result)

                            received = [];
                            expected = null;
                        }
                    }
                    catch(e) { console.error("Erreur parsing fragment:", e); }
                });
            }
            catch(err) { console.error(err); reject(err); }
        });
    }
});