import * as monaco from '/view/applets/editer/monaco-editor/esm/vs/editor/editor.main.js';

class Editer {
    #layout = "single";
    #panes = [];
    #activeFilePath = null;
    #monaco = null;
    #explorerWidth = 250;
    #explorerResizeWidth = 2;
    #explorerPanelCollapsed = false;
    #previewWidth = 250;
    #previewResizeWidth = 2;
    #previewPanelCollapsed = false;
    #previewPanelHidden = false;
    #chatWidth = 250;
    #chatResizeWidth = 2;
    #chatPanelCollapsed = false;
    #emitDebounceTimers = {};
    #isRestoring = false;

    set explorerWidth(width) {
        this.#explorerWidth = width;
        this.emit('explorerWidthChanged', width);
    }
    get explorerWidth() {
        return this.#explorerWidth;
    }
    set previewWidth(width) {
        this.#previewWidth = width;
        this.emit('previewWidthChanged', width);
    }
    get previewWidth() {
        return this.#previewWidth;
    }
    set chatWidth(width) {
        this.#chatWidth = width;
        this.emit('chatWidthChanged', width);
    }
    get chatWidth() {
        return this.#chatWidth;
    }
    get explorerResizeWidth() {
        return this.#explorerResizeWidth;
    }
    get previewResizeWidth() {
        return this.#previewResizeWidth;
    }
    get chatResizeWidth() {
        return this.#chatResizeWidth;
    }
    set explorerPanelCollapsed(collapsed) { 
        if(collapsed === this.#explorerPanelCollapsed) return;
        this.#explorerPanelCollapsed = collapsed;
        this.emit('explorerPanelCollapsed', collapsed);
    }
    get explorerPanelCollapsed() {
        return this.#explorerPanelCollapsed;
    }
    set previewPanelCollapsed(collapsed) {
        if(collapsed === this.#previewPanelCollapsed) return;
        this.#previewPanelCollapsed = collapsed;
        this.emit('previewPanelCollapsed', collapsed);
    }
    get previewPanelCollapsed() {
        return this.#previewPanelCollapsed;
    }
    set previewPanelHidden(hidden) {
        if(hidden === this.#previewPanelHidden) return;
        this.#previewPanelHidden = hidden;
        this.emit('previewPanelHidden', hidden);
    }
    get previewPanelHidden() {
        return this.#previewPanelHidden;
    }

    set chatPanelCollapsed(collapsed) {
        if(collapsed === this.#chatPanelCollapsed) return;
        this.#chatPanelCollapsed = collapsed;
        this.emit('chatPanelCollapsed', collapsed);
    }
    get chatPanelCollapsed() {
        return this.#chatPanelCollapsed;
    }

    set layout(layout) {
        this.#layout = layout;
        this.emit('layoutChanged', layout);
    }
    get layout() {
        return this.#layout;
    }

    get panes() {
        return this.#panes;
    }

    get monaco() {
        return this.#monaco;
    }
    
    set activeFilePath(filePath) {
        const oldPath = this.#activeFilePath;
        this.#activeFilePath = filePath;
        if (oldPath !== filePath && oldPath) {
            this.emit('activeFilePathChanged', { oldPath, newPath: filePath });
        }
    }
    get activeFilePath() {
        return this.#activeFilePath;
    }

    get isRestoring() {
        return this.#isRestoring;
    }
    set isRestoring(isRestoring) {
        this.#isRestoring = isRestoring;
    }

    get activePane() {
        return this.#panes.find(pane => pane.files.includes(this.#activeFilePath)) || this.#panes[0];
    }
    get activePaneIndex() {
        return this.#panes.findIndex(pane => pane.files.includes(this.#activeFilePath)) || 0;
    }

    get hasUnsavedChanges() {
        return this.#hasUnsavedChanges;
    }

    set hasUnsavedChanges(hasUnsavedChanges) {
        if (hasUnsavedChanges === this.#hasUnsavedChanges) return;
        this.#hasUnsavedChanges = hasUnsavedChanges;
        this.emit('hasUnsavedChangesChanged', hasUnsavedChanges);
    }
    
    constructor() {
        this.#monaco = monaco;
        this.#panes = [{
            activeIndex: -1,
            files: [],
        }, {
            activeIndex: -1,
            files: [],
        }, {
            activeIndex: -1,
            files: [],
        }, {
            activeIndex: -1,
            files: [],
        }];

        try {
            window.MonacoEnvironment = {
                getWorkerUrl: function (_moduleId, label) {
                    // Use proper worker URLs for ES modules
                    const basePath = '/view/applets/editer/monaco-editor/esm/vs';
                    
                    switch (label) {
                        case 'json':
                            return `${basePath}/language/json/json.worker.js`;
                        case 'css':
                        case 'scss':
                        case 'less':
                            return `${basePath}/language/css/css.worker.js`;
                        case 'html':
                        case 'handlebars':
                        case 'razor':
                            return `${basePath}/language/html/html.worker.js`;
                        case 'typescript':
                        case 'javascript':
                            return `${basePath}/language/typescript/ts.worker.js`;
                        default:
                            return `${basePath}/editor/editor.worker.js`;
                    }
                },
            };
        } catch (error) {
            console.error('Failed to load Monaco Editor:', error);
            throw error;
        }
    }

    updatePanes(panes) {
        this.#panes.forEach((pane, index) => {
            pane.files = panes[index]?.files || [];
            pane.activeIndex = [null, undefined].includes(panes[index]?.activeIndex) || -1;
        });
        this.emit('panesUpdated');
    }

    showMonacoSettings() {
        this.emit('showMonacoSettings');
    }

    showVersionHistoryModal(filePath) {
        this.emit('showVersionHistoryModal', filePath);
    }

    openFile(fileName, filePath) {
        console.log('open file in editer - received event', fileName, filePath);
        this.#activeFilePath = filePath;
        this.emit('activeFilePathChanged', { oldPath: null, newPath: filePath });
        
        if (this.activePane.files.includes(filePath)) return;

        this.activePane.files.push(filePath);
        this.activePane.activeIndex = this.activePane.files.length - 1;
        this.emit('panesUpdated');
    }

    openFileAtLine(fileName, filePath, line, column,) {
        this.emit('openFileAtLine', { fileName, filePath, line, column });
    }

    closeTabsByFilePath(filePath) {
        this.emit('closeTabsByFilePath', filePath);
    }

    async closeAllOtherTabs(paneId, keepTabId) {
        return new Promise((resolve) => {
            const handler = (e) => {
                if (e.detail && e.detail.paneId === paneId && e.detail.keepTabId === keepTabId) {
                    window.removeEventListener('closeAllOtherTabsResult', handler);
                    resolve(e.detail.closedCount);
                }
            };
            window.addEventListener('closeAllOtherTabsResult', handler);
            this.emit('closeAllOtherTabs', { paneId, keepTabId });
        });
    }



    updatePaneOptions(options) {
        if (options.theme) {
            this.#monaco.editor.setTheme(options.theme);
        }
        this.#panes.forEach(pane => {
            if (!pane.editor) {
                return;
            }
            pane.editor.updateOptions(options);
        });
    }

    saveCurrentFile() {
        this.emit('saveCurrentFile');
    }


    on(eventName, callback) {
        window.addEventListener(eventName, callback);
    }
    off(eventName, callback) {
        window.removeEventListener(eventName, callback);
    }

    emit(eventName, data, debounce = 0) {
        function emitEvent() {
            const event = new CustomEvent(eventName, { detail: data });
            window.dispatchEvent(event);
        }

        if (!debounce) {
            emitEvent();
            return;
        }
        
        if (this.#emitDebounceTimers[eventName]) {
            clearTimeout(this.#emitDebounceTimers[eventName]);
        }
        this.#emitDebounceTimers[eventName] = setTimeout(() => {
            emitEvent();
            this.#emitDebounceTimers[eventName] = null;
        }, debounce);
    }

    toString() {
        return JSON.stringify(this, null, 2);
    }
}

const editerState = new Editer();

export default editerState;