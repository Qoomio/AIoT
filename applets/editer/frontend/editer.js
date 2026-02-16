import { inject as injectNavigater } from '../../navigater/frontend/navigater.js';
import qoomEvent from "../utils/qoomEvent.js"

import Editer from './model.js';

// Monaco Editor import
import * as monaco from '/view/applets/editer/monaco-editor/esm/vs/editor/editor.main.js';

// Disable Monaco Editor dynamic imports (Raspberry Pi optimization)
if (window.monaco) {
    // Disable Monaco Editor internal module loading system
    window.monaco.editor.setModelMarkers = () => {};
    window.monaco.editor.setTheme = () => {};
    window.monaco.editor.defineTheme = () => {};
    
    // Disable Monaco Editor internal module loading
    if (window.monaco.editor.defineLanguage) {
        window.monaco.editor.defineLanguage = () => {};
    }
    if (window.monaco.languages) {
        window.monaco.languages.register = () => {};
        window.monaco.languages.setLanguageConfiguration = () => {};
    }
}

import * as chat from '../components/chat/frontend/chat.js';
import * as context from '../components/contexter/frontend/context.js';
import * as controller from '../components/controller/frontend/controller.js';
import * as editors from '../components/editorLayout/frontend/editors.js';
import * as explorer from '../components/explorer/frontend/explorer.js';
import * as history from '../components/versioner/frontend/history.js';
import * as monacoSettings from '../components/monaco-settings/frontend/monaco-settings.js';
import * as notifier from '../components/notifier/frontend/notify.js'
import * as previewer from '../components/previewer/frontend/previewer.js';
import * as publisher from '../../publisher/frontend/publisher.js';

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
const handleWidth = 2;

let editerState = null;
let explorerResize = false;
let previewResize = false;
let chatResize = false;

function setupMonacoEnvironment() {
    try {
        window.MonacoEnvironment = {
            getWorkerUrl: function (_moduleId, label) {
                // Disable worker in bundled environment
                return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(`
                    // Worker disabled
                    self.postMessage({ type: 'ready' });
                `);
            },
        };
        
        // Disable Monaco Editor dynamic imports
        if (window.monaco && window.monaco.editor) {
            // Disable Monaco Editor internal module loading
            window.monaco.editor.setModelMarkers = () => {};
            window.monaco.editor.setTheme = () => {};
            window.monaco.editor.defineTheme = () => {};
        }
    } catch (error) {
        console.error('Failed to load Monaco Editor:', error);
        throw error;
    }
}

function getInitialState() {
    const currentPath = window.location.pathname;

    const filePath = currentPath.substring(6);
    if (!filePath || filePath === "") {
        throw new Error('Cannot parse current path from url');
    }

    const state = {
        chat: {
            collapsed: localStorage.getItem('chatCollapsed') === 'true',
            width: parseInt(localStorage.getItem('chatWidth')) || 250
        },
        context: {},
        controller: {},
        explorer: {
            collapsed: localStorage.getItem('explorerCollapsed') === 'true',
            width: parseInt(localStorage.getItem('explorerWidth')) || 250
        },
        history: {},
        layout: {
            layout: 'single',
            panes: [],
            activeFilePath: filePath,
        },
        monacoSettings: {},
        notifier: {},
        preview: {
            collapsed: localStorage.getItem('previewCollapsed') === 'true',
            width: parseInt(localStorage.getItem('previewWidth')) || 250
        },
    }

    const searchParams = window.location.search;
    if (!searchParams) {
        return state;
    }

    try {
        const params = new URLSearchParams(searchParams);

        state.layout.layout = params.get('layout') || 'single';
        
        for (let i = 0; i < 4; i++) {
            const paneParam = params.get(`pane${i}`) || 'active:0';
            const parts = paneParam.split(",");
            const activeMatch = parts[parts.length - 1].match(/^active:(\d+)$/) || [null, 0];
            const files = parts.slice(0, -1).map(file => decodeURIComponent(file.trim()));
            const activeIndex = parseInt(activeMatch[1]) || 0;
            state.layout.panes.push({files: files.length > 0 ? files : i > 0 ? [] :[filePath], activeIndex: activeIndex});
        }

        // Restore panel widths (if specified)
        if (params.has("explorerWidth")) {
            state.explorer.width = parseInt(params.get("explorerWidth")) || 250;
        }
        if (params.has("previewWidth")) {
            state.preview.width = parseInt(params.get("previewWidth")) || 250;
        }
        if (params.has("chatWidth")) {
            state.chat.width = parseInt(params.get("chatWidth")) || 250;
        }
        
        // Restore panel collapsed states
        if (params.has("explorerCollapsed")) {
            state.explorer.collapsed = params.get("explorerCollapsed") === "true";
        }
        if (params.has("previewCollapsed")) {
            state.preview.collapsed = params.get("previewCollapsed") === "true";
        }
        if (params.has("chatCollapsed")) {
            state.chat.collapsed = params.get("chatCollapsed") === "true";
        }
        
    } catch (error) {
        console.error("Error parsing editor state from URL:", error);
    } finally {
        return state;
    }
}

function updateUrl() {

    const params = new URLSearchParams();
    params.set("layout", editerState.layout.layout);
    
    const panes = editerState.layout.panes || [];
    panes.forEach((pane, index) => {
        if (pane.tabs.length > 0) {
            const activeIndex = pane.tabs.findIndex(tab => tab.active) || 0;
            const files = pane.tabs.map(tab => tab.filePath)
            const paneData = files.join(",") + (activeIndex >= 0 ? `,active:${activeIndex}` : ",active:0");
            params.set(`pane${index}`, paneData);
        }
    });
    
    if (editerState.explorer.width !== 250) {
        params.set("explorerWidth", editerState.explorer.width);
    }
    if (editerState.preview.width !== 250) {
        params.set("previewWidth", editerState.preview.width);
    }
    if (editerState.chat.width !== 250) {
        params.set("chatWidth", editerState.chat.width);
    }
    
    if (editerState.explorer.collapsed) {
        params.set("explorerCollapsed", "true");
    }
    if (editerState.preview.collapsed) {
        params.set("previewCollapsed", "true");
    }
    if (editerState.chat.collapsed) {
        params.set("chatCollapsed", "true");
    }
    
    const queryString = params.toString();
    const newUrl = `/edit/${editerState.activeFilePath}${queryString ? "?" + queryString : ""}`;

    if (window.location.pathname + window.location.search !== newUrl) {
        window.history.replaceState(null, "", newUrl);
    }
}

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
    const explorerWidth = editerState.explorer.collapsed ? 0 : editerState.explorer.width;
    const previewWidth = editerState.preview.collapsed || editerState.previewPanelHidden ? 0 : editerState.preview.width;
    const hideAiPane = window.__QOOM_CONFIG?.HIDE_AI_PANE === true;
    const chatWidth = (hideAiPane || editerState.chat.collapsed) ? 0 : editerState.chat.width;

    const explorerResizeWidth = editerState.explorer.collapsed ? 0 : handleWidth;
    const previewResizeWidth = editerState.preview.collapsed || editerState.previewPanelHidden ? 0 : handleWidth;
    const chatResizeWidth = (hideAiPane || editerState.chat.collapsed) ? 0 : handleWidth;


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
    localStorage.setItem('explorerWidth', editerState.explorer.width);
    localStorage.setItem('previewWidth', editerState.preview.width);
    localStorage.setItem('chatWidth', editerState.chat.width);
    localStorage.setItem('explorerCollapsed', editerState.explorer.collapsed);
    localStorage.setItem('previewCollapsed', editerState.preview.collapsed);
    localStorage.setItem('chatCollapsed', editerState.chat.collapsed); 
}

function initializeEvents() {
    qoomEvent.on('explorerWidthChanged', updateGridTemplateColumns);
    qoomEvent.on('previewWidthChanged', updateGridTemplateColumns);
    qoomEvent.on('chatWidthChanged', updateGridTemplateColumns);
    qoomEvent.on('explorerPanelCollapsed', updateGridTemplateColumns);
    qoomEvent.on('previewPanelCollapsed', updateGridTemplateColumns);
    qoomEvent.on('previewPanelHidden', updateGridTemplateColumns);
    qoomEvent.on('chatPanelCollapsed', updateGridTemplateColumns);
    qoomEvent.on('addNewTab', updateGridTemplateColumns);
    qoomEvent.on('closedTabs', updateGridTemplateColumns);
    qoomEvent.on('activeTabChangedInPane', updateGridTemplateColumns);
    qoomEvent.on('tabContentLoaded', updateGridTemplateColumns);

    qoomEvent.on('explorerPanelCollapsed', updateUrl);
    qoomEvent.on('previewPanelCollapsed', updateUrl);
    qoomEvent.on('chatPanelCollapsed', updateUrl);
    qoomEvent.on('explorerWidthChanged', updateUrl);
    qoomEvent.on('previewWidthChanged', updateUrl);
    qoomEvent.on('chatWidthChanged', updateUrl);
    qoomEvent.on('addNewTab', updateUrl);
    qoomEvent.on('closedTabs', updateUrl);
    qoomEvent.on('activeTabChangedInPane', updateUrl);
    qoomEvent.on('activeFilePathChanged', updateUrl);

    // qoomEvent.on('showNotification', showNotification);
    
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
            const maxLeftResizeX = mainRect.width - 250 - editerState.preview.width /* - editerState.chat.width */;
            editerState.explorer.width = Math.max(10, Math.min(maxLeftResizeX, e.clientX));
        } else if (previewResize) {
            const maxRightResizeX = mainRect.width - 250 - editerState.explorer.width /* - editerState.chat.width */;
            editerState.preview.width = Math.max(10, Math.min(maxRightResizeX, mainRect.width - e.clientX /* - editerState.chat.width */));
        } else if (chatResize) {
            const maxChatResizeX = mainRect.width - 250 - editerState.explorer.width - editerState.preview.width;
            editerState.chat.width = Math.max(10, Math.min(maxChatResizeX, mainRect.width - e.clientX));
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

async function loadContent() {
    
    // Block on loading the active file
    await editerState.activeTab.loadContent()

    // load the content of each remaining tab in the background;
    editerState.layout.panes.forEach(pane => {
        pane.tabs.forEach(tab => tab.loadContent());
    })
}

async function initialize() {
    try {
        setupMonacoEnvironment();
        
        // Set Monaco Editor globally
        window.monaco = monaco;
        
        injectNavigater('editer');

        const state = getInitialState();
        
        editerState = editerState || new Editer(state);
        window.editerState = editerState;

        // Initialize all components
        await Promise.all([
            chat.initialize(editerState),
            context.initialize(editerState),
            controller.initialize(editerState),
            editors.initialize(editerState),
            explorer.initialize(editerState),
            history.initialize(editerState),
            monacoSettings.initialize(editerState),
            notifier.initialize(editerState),
            previewer.initialize(editerState),
            publisher.initialize(editerState),
        ]);
        
       updateGridTemplateColumns();
       initializeEvents();
       await loadContent();

    } catch (error) {
        console.error('Error during editor initialization:', error);
    }
}

initialize();

export { editerState } ;