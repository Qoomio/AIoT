import qoomEvent from '../../../../utils/qoomEvent.js';
import * as editors from '../../frontend/editors.js';

import * as editorTab from "../editorTab/frontend/tab.js"
import * as searchTab from "../../../searcher/frontend/search.js"
// Monaco Editor는 전역에서 가져옴

const dom = {
    panes: [],
    buttons: {
        searchTab: [],
        beautify: [],
        goto: [],
        splitVertical: [],
        splitHorizontal: [],
        close: [],
    }
}

let state;

function handleTabContentLoaded(e) {
    const tab = e.detail;
    const $pane = dom.panes[tab.paneId];
    if($pane.pane.activeTab.id !== tab.id) return;
    render(tab);
}

function handleTabContentLoading(e) {
    const { pane } = e.detail
}

function handlePaneError(e) {
    const { pane, error } = e.detail;
}

function handleTabChange(e) {
    const pane = e.detail;
    const activeTab = pane.activeTab;
    render(activeTab);
}

function updatePaneOptions(e) {
    const { options, paneId } = e.detail;
        
    if (options.theme) {
        window.monaco.editor.setTheme(options.theme);
    }
    dom.panes[paneId].editor.updateOptions(options);
}

function beautify(paneId) {
    const $pane = dom.panes[paneId];
    $pane.editor.focus();
    $pane.editor.trigger('keyboard', 'editor.action.formatDocument', null);
}

function gotoLine(paneId) {
    const $pane = dom.panes[paneId];
    $pane.editor.focus();
    $pane.editor.trigger('keyboard', 'editor.action.gotoLine', null);
}

function splitVertical(paneId) {
    console.log('splitVertical', paneId);
}

function splitHorizontal(paneId) {
    console.log('splitHorizontal', paneId);
}

function close(paneId) {
    console.log('close', paneId);
}

function openSearchTab(paneId) {
    const pane = state.layout.panes.find(p => p.id === paneId);
    if (pane) {
        pane.addTab('search://');
    }
}

async function initializeSearchTab($container) {
    try {
        const response = await fetch("/view/applets/editer/components/searcher/frontend/search.html");
        const html = await response.text();
        $container.innerHTML = html;
        $container.setAttribute('data-initialized', 'true');
        await searchTab.initialize($container);
    } catch (error) {
        console.error("Failed to load search tab:", error);
        $container.innerHTML = '<div style="padding: 20px; color: #d4d4d4;">Failed to load search tab</div>';
    }
}

function render(tab) {
    const $pane = dom.panes[tab.paneId];
    if (!$pane) return;

    const pane = state.layout.panes.find(pane => pane.id === tab.paneId);
    if (!pane) return;


    const $paneContainers = [...$pane.querySelectorAll('.pane-container')];
    $paneContainers.forEach($container => {
        $container.style.display = 'none'
    });

    // Check if this is a search tab
    if (tab.filePath === 'search://') {
        const $searchContainer = $paneContainers.find($container => 
            $container.classList.contains('editor-search')
        );
        if ($searchContainer) {
            $searchContainer.style.display = '';
            // Initialize search UI if not already initialized
            if (!$searchContainer.hasAttribute('data-initialized')) {
                initializeSearchTab($searchContainer);
            }
        }
        return;
    }

    const modeClassMap = {
        deleted: 'editor-deleted',
        editor: 'editor-content',
        empty: 'editor-empty',
        error: 'editor-error',
        loading: 'editor-loading',
        renderer: 'editor-renderer',
        search: 'editor-search'
    };

    const targetClass = modeClassMap[pane.mode];
    if (!targetClass) {
        throw new Error(`${pane.mode} is unrecognized`);
    }

    const $targetContainer = $paneContainers.find($container => 
        $container.classList.contains(targetClass)
    );
    const $renderContainer = $paneContainers.find($container => 
        $container.classList.contains(modeClassMap.renderer)
    );
    
    if ($targetContainer) {
        $targetContainer.style.display = '';
        if (pane.mode === 'editor') {
            $pane.editor.setModel(tab.model);
        } 
        if (pane.mode === 'renderer') {
            $targetContainer.innerHTML = `<iframe src='/render/${tab.filePath}'></iframe>`
        } else {
            $renderContainer.innerHTML = '';
        }
    }
}

function addEventListeners() {
    qoomEvent.on('showPaneLoadingMessage', handleTabContentLoading);
    qoomEvent.on('tabContentLoaded', handleTabContentLoaded);
    qoomEvent.on('showPaneError', handlePaneError);
    qoomEvent.on('updateMonacoSettings', updatePaneOptions);
    qoomEvent.on('activeTabChangedInPane', handleTabChange);
    qoomEvent.on('addNewTab',  handleTabChange);
    dom.buttons.searchTab.forEach(($button, i) => {
        $button.addEventListener('click', () => {
            // Trigger Monaco's find widget (Cmd+F functionality)
            editors.triggerSearch();
        });
    })
    dom.buttons.beautify.forEach(($button, i) => {
        $button.addEventListener('click', () => beautify(i))
    })
    dom.buttons.goto.forEach(($button, i) => {
        $button.addEventListener('click', () => gotoLine(i))
    })
    dom.buttons.splitVertical.forEach(($button, i) => {
        $button.addEventListener('click', () => splitVertical(i))
    })
    dom.buttons.splitHorizontal.forEach(($button, i) => {
        $button.addEventListener('click', () => splitHorizontal(i))
    })
    dom.buttons.close.forEach(($button, i) => {
        $button.addEventListener('click', () => close(i))
    })
}

async function loadMonacoEditor() {
    let editorOptions = {
        value: "",
        language: "javascript",
        theme: "vs-dark",
        automaticLayout: true,
        fontSize: 14,
        lineNumbers: "on",
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: "on",
    };

    try {
        // Load saved settings
        const response = await fetch('/edit/_api/monaco/settings');
        const result = await response.json();

        if (result.success) {
            editorOptions = { ...editorOptions, ...result.data };
        }
    } catch (error) {
        console.warn('Could not load Monaco settings, using defaults:', error);
    }

    dom.panes.forEach($pane => {
        const editorElement = $pane.querySelector('.editor-content');
        const monacoContainer = document.createElement('div');
        monacoContainer.className = 'monaco-editor';
        monacoContainer.style.cssText = 'width: 100%; height: 100%;';
        editorElement.innerHTML = '';
        editorElement.appendChild(monacoContainer);

        $pane.editor = window.monaco.editor.create(monacoContainer, editorOptions);
        $pane.paneId = parseInt($pane.getAttribute('data-pane'));
        $pane.pane = state.layout.panes.find(pane => pane.id === $pane.paneId);

        $pane.editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, async () => {
            state.layout.activePane.activeTab.save();
        });

        $pane.editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyK, async () => {
            console.log("COMMAND K TO BE IMPLEMENTED")
            // commandK.show();
        });

        $pane.editor.onDidChangeModelContent(() => {
            $pane.pane.activeTab.modified = true;
        });

        // 에디터가 생성된 후 원격 커서 추적 설정을 위해 이벤트 발생
        qoomEvent.emit('editorCreated', { pane: $pane });
    })
}

function updateControls() {
    const pane0TabCt = state.layout.panes[0].tabs.length;
    const pane1TabCt = state.layout.panes[1].tabs.length;
    const pane2TabCt = state.layout.panes[2].tabs.length;
    const pane3TabCt = state.layout.panes[3].tabs.length;

    //if(pane0TabCt <= 1 && !pane1TabCt && !pane2TabCt && !pane3TabCt) {
        dom.buttons.splitHorizontal[0].style.display = 'none';
        dom.buttons.splitVertical[0].style.display = 'none';

        dom.buttons.splitHorizontal[1].style.display = 'none';
        dom.buttons.splitVertical[1].style.display = 'none';

        dom.buttons.splitHorizontal[2].style.display = 'none';
        dom.buttons.splitVertical[2].style.display = 'none';

        dom.buttons.splitHorizontal[3].style.display = 'none';
        dom.buttons.splitVertical[3].style.display = 'none';
   // } else {
      //  dom.buttons.splitHorizontal[0].removeAttribute('style');
      //  dom.buttons.splitVertical[0].removeAttribute('style');    
    //}

}

async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="pane.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/editorLayout/editorPane/frontend/pane.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load Pane CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
	try {
		const response = await fetch("/view/applets/editer/components/editorLayout/editorPane/frontend/pane.html");
		const html = await response.text();
		const editors = document.querySelector(".editors-container");
		editors.innerHTML = state.layout.panes.map((pane, i) => {
            const style = pane.tabs.length ? '' : ' style="display:none"';
            return html.replace(`data-pane="0"`, `data-pane="${i}"${style}`)
        }).join('\n');
        dom.panes = [...document.querySelectorAll('.editor-pane')];
        dom.panes.forEach(($pane) => {
            dom.buttons.searchTab.push($pane.querySelector('.search-tab-btn'))
            dom.buttons.beautify.push($pane.querySelector('.beautify-btn'))
            dom.buttons.goto.push($pane.querySelector('.goto-line-btn'))
            dom.buttons.splitVertical.push($pane.querySelector('.split-vertical-btn'))
            dom.buttons.splitHorizontal.push($pane.querySelector('.split-horizontal-btn'))
            dom.buttons.close.push($pane.querySelector('.close-pane-btn'))
        })
	} catch (error) {
		console.error("Failed to load panes template:", error);
	}
}

async function initialize(_state) {
	state = _state;
    await injectCSS();
    await injectHTML();
    await loadMonacoEditor();
    await updateControls();
    await editorTab.initialize(state);

    addEventListeners();

    console.log('Editor Panes initialized');
}

/**
 * Get the active Monaco editor instance
 * @returns {monaco.editor.IStandaloneCodeEditor|null} The active editor or null if not found
 */
function getActiveEditor() {
    if (!state || !state.layout) return null;
    
    const activePane = state.layout.activePane;
    if (!activePane) return null;
    
    // Find the DOM pane element that matches the active pane
    // Check both paneId and pane.id for compatibility
    const $pane = dom.panes.find($p => {
        const paneId = $p.paneId !== undefined ? $p.paneId : ($p.pane ? $p.pane.id : null);
        return paneId === activePane.id;
    });
    
    if (!$pane || !$pane.editor) return null;
    
    return $pane.editor;
}

export {
    initialize,
    getActiveEditor
}