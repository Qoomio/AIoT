import qoomEvent from '../../../../utils/qoomEvent.js';
import EditorTab from '../editorTab/frontend/model.js';

class EditorPane {
    #active = false;
    #id = null;
    #tabs = [];

    get active() {
        return this.#active;
    }

    get activeTab() {
        return this.#tabs.find(tab => tab.active);
    }

    get id() {
        return this.#id;
    }
    
    get tabs() {
        return this.#tabs;
    }

    get mode() {
        // returns one of: ['deleted', 'editor', 'empty', 'error', 'loading', 'renderer', 'search'];
        if (!this.activeTab) return 'empty';
        if (this.activeTab.filePath === 'search://') return 'search';
        if (this.activeTab.isDeleted) return 'deleted';
        if (this.activeTab.isLoading) return 'loading';
        if (this.activeTab.isBinary || this.activeTab.isTooLarge)  return 'renderer';
        if (this.activeTab.error) return 'error';
        // if (!this.activeTab.content) return 'empty';
        return 'editor';

    }

    set active(active) {
        if(this.#active === active) return;
        this.#active = active;
    }

    constructor(state) {
        const { files = [], active = false, activeIndex = 0, id } = state;
        this.#id = id;
        this.#tabs = files.map((file, i) => new EditorTab({ filePath: file, active: i === activeIndex, id: i, paneId: id }))
        this.#active = active;
    }

    activateTab(id)  {
        const tab = this.#tabs[id];
        if(!tab) return;

        this.#tabs.forEach(tab => tab.active = false);
        tab.active = true;
        qoomEvent.emit('activeTabChangedInPane', this);
    }

    addTab(filePath) {
        const existingTab = this.#tabs.find(tab => tab.filePath === filePath)
        if(existingTab) {
            return this.activateTab(existingTab.id)
        }
        const id = this.#tabs.length;
        const newTab = new EditorTab({filePath, id, paneId: this.#id })
        this.#tabs.push(newTab);
        this.activateTab(this.#tabs.length - 1);
        
        qoomEvent.emit('showPaneLoadingMessage', this);
        newTab.loadContent()
            .then(() => {
                qoomEvent.emit('addNewTab', this);
            }).catch((error) => {
                qoomEvent.emit('showPaneError', { pane: this, error });
            });
    }

    closeAllOtherTabs(keepTabId) {
        this.#tabs.filter(tab => tab.id !== keepTabId).forEach(tab => tab.dispose());
        this.#tabs = [this.#tabs.find(tab => keepTabId === tab.id)];
        this.#tabs[0].id = 0;
        this.activateTab(0);
        qoomEvent.emit('closedTabs', this);
    }

    closeTab(tabId) {
        if(this.#tabs.length < 2) return; 
        const tabToClose = this.#tabs.find(tab => tab.id === tabId);
        tabToClose.dispose();

        this.#tabs = this.#tabs.filter(tab => tab.id !== tabId);
        this.#tabs.forEach((tab, id) => tab.id = id);
        this.activateTab(0);
        qoomEvent.emit('closedTabs', this);        
    }

    updatePaneOptions(options) {
        qoomEvent.emit('updateMonacoSettings', { options, paneId: this.#id })
    }
}

export default EditorPane;