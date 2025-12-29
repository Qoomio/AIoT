import { inject as injectNavigater } from '/view/applets/navigater/frontend/navigater.js';

import editerState from '/view/applets/editer/Editer.js';
import * as chat from '/view/applets/editer/chat/frontend/chat.js';
import * as context from '/view/applets/editer/contexter/frontend/context.js';
import * as controller from '/view/applets/editer/controller/frontend/controller.js';
import * as editors from '/view/applets/editer/editors/frontend/editors.js';
import * as explorer from '/view/applets/editer/explorer/frontend/explorer.js';
import * as history from '/view/applets/editer/versioner/frontend/history.js';
import * as monacoSettings from '/view/applets/editer/monaco-settings/frontend/monaco-settings.js';
import * as previewer from '/view/applets/editer/previewer/frontend/previewer.js';

const dom = {
    controls: document.querySelector('.controls'),
    explorer: document.querySelector('.explorer'),
    editors: document.querySelector('.editors'),
    preview: document.querySelector('.widgets-preview'),
    chat: document.querySelector('.widgets-chat'),
    context: document.querySelector('.context'),
    footer: document.querySelector('.editor-footer'),
    explorerResize: document.querySelector('.left-resize'),
    previewResize: document.querySelector('.right-resize'),
    chatResize: document.querySelector('.chat-resize'),
    main: document.querySelector('main'),
}

let explorerResize = false;
let previewResize = false;
let chatResize = false;
let notificationContainer = null;


function disableTextSelection() {
    document.body.style.userSelect = 'none';
    document.body.style.mozUserSelect = 'none';
    document.body.style.msUserSelect = 'none';
    document.body.style.cursor = 'col-resize';
    
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        iframe.style.pointerEvents = 'none';
    });
}

function enableTextSelection() {
    document.body.style.userSelect = '';
    document.body.style.mozUserSelect = '';
    document.body.style.msUserSelect = '';
    document.body.style.cursor = '';

    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        iframe.style.pointerEvents = '';
    });
}

function updateGridTemplateColumns() {
    const explorerWidth = editerState.explorerPanelCollapsed ? 0 : editerState.explorerWidth;
    const previewWidth = editerState.previewPanelCollapsed || editerState.previewPanelHidden ? 0 : editerState.previewWidth;
    const chatWidth = editerState.chatPanelCollapsed ? 0 : editerState.chatWidth;

    const explorerResizeWidth = editerState.explorerPanelCollapsed ? 0 : editerState.explorerResizeWidth;
    const previewResizeWidth = editerState.previewPanelCollapsed || editerState.previewPanelHidden ? 0 : editerState.previewResizeWidth;
    const chatResizeWidth = editerState.chatPanelCollapsed ? 0 : editerState.chatResizeWidth;

    console.log('updateGridTemplateColuns', { previewResizeWidth })

    if (explorerWidth === 0) {
        dom.explorer.style.display = 'none';
    } else {
        dom.explorer.style.display = 'block';
    }

    if (previewWidth === 0) {
        dom.preview.style.display = 'none';
    } else {
        dom.preview.style.display = 'block';
    }

    if (chatWidth === 0) {
        dom.chat.style.display = 'none';
    } else {
        dom.chat.style.display = 'block';
    }

    if (explorerResizeWidth === 0) {
        dom.explorerResize.style.display = 'none';
    } else {
        dom.explorerResize.style.display = 'block';
    }

    if (previewResizeWidth === 0) {
        dom.previewResize.style.display = 'none';
    } else {
        dom.previewResize.style.display = 'block';
    }

    if (chatResizeWidth === 0) {    
        dom.chatResize.style.display = 'none';
    } else {
        dom.chatResize.style.display = 'block';
    }

    const gridTemplateColumnStyle = `${explorerWidth}px ${explorerResizeWidth}px auto ${previewResizeWidth}px ${previewWidth}px ${chatResizeWidth}px ${chatWidth}px`;
    dom.main.style.gridTemplateColumns  = gridTemplateColumnStyle;
    localStorage.setItem('explorerWidth', editerState.explorerWidth);
    localStorage.setItem('previewWidth', editerState.previewWidth);
    localStorage.setItem('chatWidth', editerState.chatWidth);
    localStorage.setItem('explorerCollapsed', editerState.explorerPanelCollapsed);
    localStorage.setItem('previewCollapsed', editerState.previewPanelCollapsed);
    localStorage.setItem('chatCollapsed', editerState.chatPanelCollapsed); 
}

function deserializeEditorState() {
    const currentPath = window.location.pathname;

    const filePath = currentPath.substring(6);
    if (!filePath || filePath === "") {
        return;
    }
    
    editerState.activeFilePath = filePath;

    const searchParams = window.location.search;
    if (!searchParams) {
        return;
    }

    try {
        const params = new URLSearchParams(searchParams);
        
        // Set layout
        editerState.layout.layout = params.get('layout') || 'single';
        
        // Restore panes   
        const panes = [];
        for (let i = 0; i < 4; i++) {
            const paneParam = params.get(`pane${i}`) || 'active:0';
            const parts = paneParam.split(",");
            const activeMatch = parts[parts.length - 1].match(/^active:(\d+)$/) || [null, 0];
            const files = parts.slice(0, -1).map(file => decodeURIComponent(file.trim()));
            const activeIndex = parseInt(activeMatch[1]) || 0;
            panes.push({files: files.length > 0 ? files : i > 0 ? [] :[filePath], activeIndex: activeIndex});
        }
        editerState.layout.panes = panes;

        // Restore panel widths (if specified)
        if (params.has("explorerWidth") && !editerState.explorerPanelCollapsed) {
            editerState.explorerWidth = parseInt(params.get("explorerWidth")) || 250;
        }
        if (params.has("previewWidth") && !editerState.previewPanelCollapsed) {
            editerState.previewWidth = parseInt(params.get("previewWidth")) || 250;
        }
        if (params.has("chatWidth") && !editerState.chatPanelCollapsed) {
            editerState.chatWidth = parseInt(params.get("chatWidth")) || 250;
        }
        
        // Restore panel collapsed states
        if (params.has("explorerCollapsed")) {
            editerState.explorerPanelCollapsed = params.get("explorerCollapsed") === "true";
        }
        if (params.has("previewCollapsed")) {
            editerState.previewPanelCollapsed = params.get("previewCollapsed") === "true";
        }
        if (params.has("chatCollapsed")) {
            editerState.chatPanelCollapsed = params.get("chatCollapsed") === "true";
        }
        
    } catch (error) {
        console.error("Error parsing editor state from URL:", error);
        // Fallback to default single pane with current file
        editerState.layout = "single";
        editerState.updatePanes([{files: [filePath], activeIndex: 0}]);
    }
}

function serializeEditorState() {
    const params = new URLSearchParams();
    
    // Layout (single, vertical, horizontal, quad)
    if (editerState.layout && editerState.layout !== "single") {
        params.set("layout", editerState.layout);
    }
    
    // Panes with tabs and active tab
    const panes = editerState.panes || [];
    panes.forEach((pane, index) => {
        if (pane.files && pane.files.length > 0) {
            const files = pane.files.map(file=> encodeURIComponent(file));
            const activeIndex = pane.activeIndex;
            const paneData = files.join(",") + (activeIndex >= 0 ? `,active:${activeIndex}` : ",active:0");
            params.set(`pane${index}`, paneData);
        }
    });
    
    // Panel widths (only if different from defaults)
    if (editerState.explorerWidth !== 250) {
        params.set("explorerWidth", editerState.explorerWidth);
    }
    if (editerState.previewWidth !== 250) {
        params.set("previewWidth", editerState.previewWidth);
    }
    if (editerState.chatWidth !== 250) {
        params.set("chatWidth", editerState.chatWidth);
    }
    
    // Panel collapsed states (only if collapsed)
    if (editerState.explorerPanelCollapsed) {
        params.set("explorerCollapsed", "true");
    }
    if (editerState.previewPanelCollapsed) {
        params.set("previewCollapsed", "true");
    }
    if (editerState.chatPanelCollapsed) {
        params.set("chatCollapsed", "true");
    }
    
    const queryString = params.toString();
    return queryString ? "?" + queryString : "";
}

function updateUrl() {
    console.log('open file in editer - update url');
    // If restoring state, skip URL update (assume editerState.isRestoring is set during restore)
    if (editerState.isRestoring) return;

    if (!editerState.activeFilePath) {
        return; // Don't update URL if no file is open
    }

    const queryString = serializeEditorState();
    const newUrl = `/edit/${editerState.activeFilePath}${queryString}`;

    if (window.location.pathname + window.location.search !== newUrl) {
        window.history.replaceState(null, "", newUrl);
    }
}

function showNotification(e) {
    const { message, type } = e.detail;
	const notification = document.createElement('div');
	notification.className = `notification notification-${type}`;
	notification.textContent = message;

	notificationContainer.innerHTML = '';
	notificationContainer.appendChild(notification);

	setTimeout(() => notification.remove(), 3000);
}

function initializePanels() {
    editerState.explorerWidth = parseInt(localStorage.getItem('explorerWidth')) || 250;
    editerState.previewWidth = parseInt(localStorage.getItem('previewWidth')) || 250;
    editerState.chatWidth = parseInt(localStorage.getItem('chatWidth')) || 250;

    editerState.previewPanelCollapsed = localStorage.getItem('previewCollapsed') === 'true';
    editerState.chatPanelCollapsed = localStorage.getItem('chatCollapsed') === 'true';
    editerState.explorerPanelCollapsed = localStorage.getItem('explorerCollapsed') === 'true';
}

function initializeNotifications() {
    notificationContainer = document.createElement("div");
    notificationContainer.className = "notification-container";
    document.body.appendChild(notificationContainer);
}

function initializeEvents() {
    editerState.on('explorerWidthChanged', updateGridTemplateColumns);
    editerState.on('previewWidthChanged', updateGridTemplateColumns);
    editerState.on('chatWidthChanged', updateGridTemplateColumns);

    editerState.on('explorerPanelCollapsed', updateGridTemplateColumns);
    editerState.on('previewPanelCollapsed', updateGridTemplateColumns);
    editerState.on('previewPanelHidden', updateGridTemplateColumns);
    editerState.on('chatPanelCollapsed', updateGridTemplateColumns);

    editerState.on('explorerPanelCollapsed', updateUrl);
    editerState.on('previewPanelCollapsed', updateUrl);
    editerState.on('chatPanelCollapsed', updateUrl);
    editerState.on('explorerWidthChanged', updateUrl);
    editerState.on('previewWidthChanged', updateUrl);
    editerState.on('chatWidthChanged', updateUrl);
    
    editerState.on('panesUpdated', () => {
        updateUrl();
    });
    editerState.on('activeFilePathChanged', updateUrl);
    editerState.on('layoutChanged', updateUrl);

    editerState.on('showNotification', showNotification);
    
    dom.explorerResize.addEventListener('mousedown', (e) => {
        if (editerState.explorerPanelCollapsed) return;
        dom.explorerResize.style.backgroundColor = '#0f0';
        explorerResize = true;
        disableTextSelection();
        e.preventDefault();
    });
    
    dom.previewResize.addEventListener('mousedown', (e) => {
        if (editerState.previewPanelCollapsed) return;
        dom.previewResize.style.backgroundColor = '#0f0';
        previewResize = true;
        disableTextSelection();
        e.preventDefault();
    });

    dom.chatResize.addEventListener('mousedown', (e) => {
        if (editerState.chatPanelCollapsed) return;
        dom.chatResize.style.backgroundColor = '#0f0';
        chatResize = true;
        disableTextSelection();
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        const mainRect = dom.main.getBoundingClientRect();
        if (explorerResize) {
            const maxLeftResizeX = mainRect.width - 250 - editerState.previewWidth - editerState.chatWidth;
            editerState.explorerWidth = Math.max(10, Math.min(maxLeftResizeX, e.clientX));
        } else if (previewResize) {
            const maxRightResizeX = mainRect.width - 250 - editerState.explorerWidth - editerState.chatWidth;
            editerState.previewWidth = Math.max(10, Math.min(maxRightResizeX, mainRect.width - e.clientX - editerState.chatWidth));
        } else if (chatResize) {
            const maxChatResizeX = mainRect.width - 250 - editerState.explorerWidth - editerState.previewWidth;
            editerState.chatWidth = Math.max(10, Math.min(maxChatResizeX, mainRect.width - e.clientX));
        }
    });
    
    document.addEventListener('mouseup', (e) => {
        dom.explorerResize.style = '';
        explorerResize = false;
    
        dom.previewResize.style = '';
        previewResize = false;

        dom.chatResize.style = '';
        chatResize = false;

        enableTextSelection(); 
        updateGridTemplateColumns();
    });

    document.addEventListener('mouseleave', (e) => {
        if (explorerResize || previewResize || chatResize) {
            dom.explorerResize.style = '';
            explorerResize = false;

            dom.previewResize.style = '';
            previewResize = false;
            
            dom.chatResize.style = '';
            chatResize = false;
            
            enableTextSelection();
            updateGridTemplateColumns();
        }
    });
}

async function initialize() {
    injectNavigater('editer');

    // Seed the editor state with what is in the url
    deserializeEditorState();
    
    // Initialize all components
    await Promise.all([
        chat.initialize(editerState),
        context.initialize(editerState),
        controller.initialize(editerState),
        editors.initialize(editerState),
        explorer.initialize(editerState),
        history.initialize(editerState),
        monacoSettings.initialize(editerState),
        previewer.initialize(editerState),
    ])

    // TODO: MOVE TO COMPONENT
    initializePanels();
    initializeNotifications();
    initializeEvents();
    updateGridTemplateColumns();

    window.editerState = editerState;
}

initialize();

export { editerState } ;