
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

function loadNavigatorCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="navigator.css"]')) {
        return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = '/view/applets/navigator/frontend/navigator.css';
    
    document.head.appendChild(link);
}

// Cache for environment info
let cachedEnv = null;

async function getEnvironment() {
    if (cachedEnv !== null) return cachedEnv;
    try {
        const res = await fetch('/navigator/env');
        if (!res.ok) return 'user';
        const data = await res.json();
        cachedEnv = data.env || 'user';
        return cachedEnv;
    } catch (err) {
        console.error('Failed to get environment info:', err);
        return 'user';
    }
}

// Only these two rules; other nav buttons are left as-is (per ecosystem.config.cjs CHALLENGER_ROLE)
function removeUnavailableButtons(headerElement, env) {
    if (env === 'student') {
        const btn = headerElement.querySelector('[data-applet="Students"]');
        if (btn) btn.remove();
    }
    if (env === 'teacher') {
        const btn = headerElement.querySelector('[data-applet="challenger"]');
        if (btn) btn.remove();
    }
}

/**
 * Update the Editer link in the navigator-header to point to the last editor URL
 * so that open tabs are preserved when navigating back to the editor.
 */
function updateEditerLink() {
    try {
        const lastUrl = localStorage.getItem('editerLastUrl');
        if (lastUrl && lastUrl.startsWith('/edit/')) {
            const editerBtn = document.querySelector('.navigator-header [data-applet="editer"] a');
            if (editerBtn) {
                editerBtn.setAttribute('href', lastUrl);
            }
        }
    } catch (e) {
        // Ignore localStorage errors
    }
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
    loadNavigatorCSS();
    // Check if navigator is already injected
    if (document.querySelector('[data-navigator-injected]')) {
        console.log('Navigator already injected, skipping...');
        addEventListeners();
        return;
    }
    
    // Determine the base path for the navigator.html file
    const currentScript = document.currentScript;
    let basePath = '/view/applets/navigator/frontend/';
    
    // If we can determine the script's location, use relative path
    if (currentScript && currentScript.src) {
        const scriptUrl = new URL(currentScript.src);
        basePath = scriptUrl.pathname.replace('navigator.js', '');
    }
    
    // Fetch environment and navigator.html in parallel
    try {
        const [envResult, htmlResponse] = await Promise.all([
            getEnvironment(),
            fetch(basePath + 'navigator.html')
        ]);
        
        if (!htmlResponse.ok) {
            throw new Error(`HTTP error! status: ${htmlResponse.status}`);
        }
        const html = await htmlResponse.text();
        
        // Create a temporary div to hold the HTML content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html.trim();

        // Add data attribute to mark as injected
        const headerElement = tempDiv.firstChild;
        if (headerElement) {
            headerElement.setAttribute('data-navigator-injected', 'true');
            
            // Remove unavailable buttons BEFORE adding to DOM (prevents flicker)
            removeUnavailableButtons(headerElement, envResult);

            // Insert as the first child of the body element
            if (document.body.firstChild) {
                document.body.insertBefore(headerElement, document.body.firstChild);
            } else {
                document.body.appendChild(headerElement);
            }
            addEventListeners();
        }
        // Restore the last editor URL so tabs are preserved when navigating back
        updateEditerLink();

        document.querySelectorAll(`.navigator-header [data-applet]`).forEach(button => {
            button.classList.remove('active');
        });
        const targetButton = document.querySelector(`.navigator-header [data-applet="${appletName}"]`);
        if (targetButton) {
            targetButton.classList.add('active');
        }
        
    } catch (error) {
        console.error('Error loading navigator.html:', error);
        // Fallback to inline HTML if AJAX fails
        injectNavigator();
    }
}

