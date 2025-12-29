
'use strict';

function isInIframe() {
    try {
        return window.self !== window.top;
    } catch (e) {
        // If we can't access window.top due to cross-origin restrictions,
        // we're likely in an iframe
        return true;
    }
}

function loadNavigaterCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="navigater.css"]')) {
        return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = '/view/applets/navigater/frontend/navigater.css';
    
    document.head.appendChild(link);
}

function addEventListeners() {
    const remoteBtn = document.querySelector('#remote-button');
    const pullBtn = document.querySelector('#pull-button');

    if (remoteBtn && !remoteBtn._qoomBound) {
        remoteBtn._qoomBound = true;
        remoteBtn.addEventListener('click', async () => {
            try {
                remoteBtn.disabled = true;
                const res = await fetch('/updater/git/remote', { method: 'POST' });
                if (!res.ok) throw new Error(`Remote Failed: ${res.status}`);
                alert('Remote Success!');
            } catch (err) {
                console.error(err);
                alert('Remote Error');
            } finally {
                remoteBtn.disabled = false;
            }
        });
    }

    if (pullBtn && !pullBtn._qoomBound) {
        pullBtn._qoomBound = true;
        pullBtn.addEventListener('click', async () => {
            try {
                pullBtn.disabled = true;
                let res = await fetch('/updater/git/pull', { method: 'POST' });
                if (!res.ok) {
                    // If conflict due to local changes, ask for strategy
                    if (res.status === 409) {
                        const choice = prompt('[Pull Failed] Local changes exist.\n- stash: save changes and pull\n- force: discard local changes and force sync with remote\n(input: stash | force | cancel)', 'stash');
                        if (choice === 'stash' || choice === 'force') {
                            res = await fetch(`/updater/git/pull?strategy=${encodeURIComponent(choice)}`, { method: 'POST' });
                            if (!res.ok) throw new Error(`Pull Failed: ${res.status}`);
                            const data = await res.json();
                            alert(data.message || 'Pull Success!');
                        } else {
                            alert('Canceled.');
                            return;
                        }
                    } else {
                        throw new Error(`Pull Failed: ${res.status}`);
                    }
                } else {
                    const data = await res.json();
                    alert(data.message || 'Pull Success!');
                }
            } catch (err) {
                console.error(err);
                alert('Pull Error');
            } finally {
                pullBtn.disabled = false;
            }
        });
    }
}


export async function inject(appletName) {
    if (isInIframe()) {
        return;
    }
    loadNavigaterCSS();
    // Check if navigater is already injected
    if (document.querySelector('[data-navigater-injected]')) {
        console.log('Navigater already injected, skipping...');
        addEventListeners();
        return;
    }
    
    // Determine the base path for the navigater.html file
    const currentScript = document.currentScript;
    let basePath = '/view/applets/navigater/frontend/';
    
    // If we can determine the script's location, use relative path
    if (currentScript && currentScript.src) {
        const scriptUrl = new URL(currentScript.src);
        basePath = scriptUrl.pathname.replace('navigater.js', '');
    }
    
    // Fetch the navigater.html file
    try {
        const response = await fetch(basePath + 'navigater.html');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        // Create a temporary div to hold the HTML content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html.trim();

        // Add data attribute to mark as injected
        const headerElement = tempDiv.firstChild;
        if (headerElement) {
            headerElement.setAttribute('data-navigater-injected', 'true');

            // Insert as the first child of the body element
            if (document.body.firstChild) {
                document.body.insertBefore(headerElement, document.body.firstChild);
            } else {
                document.body.appendChild(headerElement);
            }
            addEventListeners();
        }
        document.querySelectorAll(`.navigater-header [data-applet]`).forEach(button => {
            button.classList.remove('active');
        });
        const targetButton = document.querySelector(`.navigater-header [data-applet="${appletName}"]`);
        if (targetButton) {
            targetButton.classList.add('active');
        }
    } catch (error) {
        console.error('Error loading navigater.html:', error);
        // Fallback to inline HTML if AJAX fails
        injectNavigater();
    }
}

