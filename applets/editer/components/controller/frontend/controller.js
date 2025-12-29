
'use strict';
import qoomEvent from "../../../utils/qoomEvent.js"

let state;
let layoutButtons = null;
let saveButton = null;
let chatToggle = null;
let previewToggle = null;
let explorerToggle = null;
let settingsButton = null;
let updateButton = null;

function updateSaveButton(e) {
    const tabThatTriggeredEvent = e.detail;
    const activeTab = state.layout.activePane.activeTab;
    if (!tabThatTriggeredEvent.equals(activeTab)) return;

    saveButton.disabled = activeTab.isSaving || !activeTab.modified
    saveButton.title = activeTab.modified
        ? "Save File (Ctrl+S) - Unsaved changes"
        : activeTab.isSaving 
            ? "Save File (Ctrl+S) - Saving..."
            : "Save File (Ctrl+S) - No changes";


    if (activeTab.modified) {
        saveButton.classList.add("has-changes");
    } else {
        saveButton.classList.remove("has-changes");
    }
}

function selectWhatLayoutButtonsToShow() {
    const panesWithFilesCt = state.layout.panes.filter(pane => pane.tabs.length).length;
    if (panesWithFilesCt < 2) {
        layoutButtons.single.parentElement.style.display = 'none';
        layoutButtons.horizontal.style.display = 'none';
        layoutButtons.vertical.style.display = 'none';
        layoutButtons.quad.style.display = 'none';
    } else if( panesWithFilesCt === 2) {
        layoutButtons.single.parentElement.removeAttribute('style');
        layoutButtons.horizontal.removeAttribute('style');
        layoutButtons.vertical.removeAttribute('style');
        layoutButtons.quad.style.display = 'none';
    } else {
        layoutButtons.single.parentElement.removeAttribute('style');
        layoutButtons.horizontal.removeAttribute('style');
        layoutButtons.vertical.removeAttribute('style');
        layoutButtons.quad.removeAttribute('style');
    }
}

function setupControllerEvents() {

    explorerToggle.addEventListener('click', () => state.explorer.toggleCollapsed());

    chatToggle.addEventListener('click', () => state.chat.toggleCollapsed());

    previewToggle.addEventListener('click', () => state.preview.toggleCollapsed());

    settingsButton.addEventListener('click', () => state.monacoSettings.show());
    async function fetchBootIdViaWS(timeoutMs = 5000) {
        return new Promise((resolve) => {
            const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
            const ws = new WebSocket(`${protocol}://${location.host}/watcher/_sync`);
            const t = setTimeout(() => {
                try { ws.close(); } catch(e) {}
                resolve(null);
            }, timeoutMs);
            ws.onmessage = (evt) => {
                try {
                    const msg = JSON.parse(evt.data);
                    if (msg.type === 'connection_established' && msg.bootId) {
                        clearTimeout(t);
                        try { ws.close(); } catch(e) {}
                        resolve(msg.bootId);
                    }
                } catch(e) {}
            };
            ws.onerror = () => {
                clearTimeout(t);
                resolve(null);
            };
            ws.onclose = () => {
            };
        });
    }

    function waitForServiceRestart(prevBootId, totalTimeoutMs = 120000) {
        return new Promise((resolve) => {
            const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
            let finished = false;
            const deadline = Date.now() + totalTimeoutMs;

            function attemptConnect() {
                if (finished) return;
                const ws = new WebSocket(`${protocol}://${location.host}/watcher/_sync?awaitRestart=1&bootId=${encodeURIComponent(prevBootId || '')}`);

                ws.onmessage = (evt) => {
                    try {
                        const msg = JSON.parse(evt.data);
                        if (msg && msg.type === 'service_restarted') {
                            finished = true;
                            try { ws.close(); } catch(e) {}
                            resolve(true);
                        }
                    } catch(e) {}
                };

                ws.onopen = () => {
                };

                ws.onerror = () => {
                };

                ws.onclose = () => {
                    if (finished) return;
                    if (Date.now() >= deadline) {
                        resolve(false);
                        return;
                    }
                    setTimeout(attemptConnect, 1500);
                };
            }

            attemptConnect();
        });
    }

    updateButton.addEventListener('click', async () => {
        try {
            updateButton.disabled = true;
            updateButton.textContent = 'Updating...';

            let currentBootId = window.__QOOM_BOOT_ID;
            if (!currentBootId) {
                currentBootId = await fetchBootIdViaWS();
                if (currentBootId) {
                    window.__QOOM_BOOT_ID = currentBootId;
                }
            }

            const res = await fetch('/updater/deploy', { method: 'POST' });
            if (!res.ok) throw new Error('Failed to start deploy');

            const restarted = await waitForServiceRestart(currentBootId, 120000);
            if (!restarted) {
                location.reload();
                return;
            }
            location.reload();
        } catch (e) {
            console.error(e);
            alert('Update failed to start');
            updateButton.disabled = false;
            updateButton.textContent = '⟳ Update';
        }
    });

    Object.values(layoutButtons).forEach(btn => {
        btn.addEventListener('click', () => {
            state.layout = btn.id.replace('layout-', '');
        });
    });

    saveButton.addEventListener('click', async () => {
        state.layout.activePane.activeTab.save();
    });

    qoomEvent.on('layoutChanged', (e) => {
        const layout = e.detail;
        Object.values(layoutButtons).forEach(btn => {
            btn.classList.remove('active');
        });
        layoutButtons[layout].classList.add('active');
        selectWhatLayoutButtonsToShow();
    });

    qoomEvent.on('explorerPanelCollapsed', (e) => {
        const collapsed = e.detail;
        if(collapsed) {
            explorerToggle.classList.remove('active');
        } else {
            explorerToggle.classList.add('active');
        }
    });

    qoomEvent.on('chatPanelCollapsed', (e) => {
        const collapsed = e.detail;
        if(collapsed) {
            chatToggle.classList.remove('active');
        } else {
            chatToggle.classList.add('active');
        }
    }); 

    qoomEvent.on('previewPanelCollapsed', (e) => {
        const collapsed = e.detail;
        if(collapsed) {
            previewToggle.classList.remove('active');
        } else {
            previewToggle.classList.add('active');
        }
    });

    qoomEvent.on('tabIsSaving', updateSaveButton);
    qoomEvent.on('tabModified', updateSaveButton);
}

function initializeController() {
    layoutButtons = [...document.querySelectorAll('.layout-btn')].reduce((o, $btn) => {
        const layout = $btn.id.split('-').pop();
        o[layout] = $btn;
        return o;
    }, {});
    explorerToggle = document.querySelector('#toggle-explorer');
    saveButton = document.querySelector('#save-button');
    chatToggle = document.querySelector('#toggle-chat');
    previewToggle = document.querySelector('#toggle-preview');
    settingsButton = document.querySelector('#monaco-settings-button');
    updateButton = document.querySelector('#update-button');

    // Hide update button if not in education mode
    const nodeEnv = window.__QOOM_CONFIG?.NODE_ENV || 'development';
    if (nodeEnv !== 'education') {
        updateButton.style.display = 'none';
    }

    // Hide chat/AI pane if HIDE_AI_PANE is set to true
    const hideAiPane = window.__QOOM_CONFIG?.HIDE_AI_PANE === true;
    if (hideAiPane) {
        chatToggle.style.display = 'none';
        const chatPanel = document.querySelector('.widgets-chat');
        const chatResize = document.querySelector('.chat-resize');
        if (chatPanel) chatPanel.style.display = 'none';
        if (chatResize) chatResize.style.display = 'none';
    }

    if(!state.explorer.collapsed) {
        explorerToggle.classList.add('active');
    }
    if(!state.chat.collapsed) {
        chatToggle.classList.add('active');
    }
    if(!state.preview.collapsed) { 
        previewToggle.classList.add('active');
    }
    selectWhatLayoutButtonsToShow();
}

async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="controller.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/controller/frontend/controller.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load Controller CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
    try {
        const response = await fetch('/view/applets/editer/components/controller/frontend/controller.html');
        const html = await response.text();
        const controller = document.querySelector('.controls');
        controller.innerHTML = html.replace('{{filePath}}', location.pathname.split('/').reverse()[0]);
    } catch (error) {
        console.error('Failed to load chat template:', error);
    }
}

async function initialize(_state) {
    state = _state;
    await injectCSS();
    await injectHTML(); 

    initializeController();
    setupControllerEvents();

    console.log('Controller initialized');
}

export {
    initialize
}
