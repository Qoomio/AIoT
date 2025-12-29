import EditorTab from '../editors/EditorTab.js';
import * as commandK from '/view/applets/editer/chat/frontend/command-k.js';

class EditorPane {
    #activeTabId;
    #contentChangeListener;
    #editor;
    #element;
    #id;
    #layout;
    #monaco;
    #tabs;

    #beautifyBtn;
    #gotoLineBtn;
    #closePaneBtn;
    #splitHorizontalBtn;
    #splitVerticalBtn;

    // ==== Public Getters (alphabetized) ====
    get activeTabId() { return this.#activeTabId; }
    get closePaneBtn() { return this.#closePaneBtn; }
    get editerState() { return this.#layout.editerState; }
    get editor() { return this.#editor; }
    get element() { return this.#element; }
    get id() { return this.#id; }
    get isActive() { return this.#layout.editerState.activePaneIndex === this.#id; }
    get splitHorizontalBtn() { return this.#splitHorizontalBtn; }
    get splitVerticalBtn() { return this.#splitVerticalBtn; }
    get tabs() { return this.#tabs; }
    get monaco() { return this.#monaco; }

    constructor(pane, monaco, layout = null) {
        this.#id = pane.id;
        this.#tabs = [];
        this.#activeTabId = pane.activeIndex;
        this.#editor = null;
        this.#layout = layout || 'single';
        this.#monaco = monaco;
    }

    addTab(fileName, filePath = "") {
        // Check if tab already exists
        const existingTab = this.#tabs.find((tab) => tab.filePath === filePath);
        if (existingTab) {
            this.setActiveTab(existingTab.id).catch(console.error);
            return existingTab;
        }

        const tab = new EditorTab(fileName, filePath, this);
        this.#tabs.push(tab);
        this.renderTabs();
        this.setActiveTab(tab.id).catch(console.error);
        // State updates will be handled through events

        return tab;
    }

    getActiveTab() {
        return this.#tabs.find((tab) => tab.id === this.#activeTabId);
    }

    isVisible() {
        return this.#element.style.display !== "none";
    }

    renderTabs() {
        const tabList = this.#element.querySelector(".tab-list");
        if (!tabList) return;
        tabList.innerHTML = this.#tabs
            .map(
                (tab) => `
    <div class="tab ${tab.id === this.#activeTabId ? "active" : ""} ${tab.modified ? "modified" : ""}"
    data-tab="${tab.id}"
    data-pane="${this.#id}"
    data-file-path="${tab.filePath || ''}"
    draggable="true">
    <span class="tab-name" title="${tab.fileName}">${tab.fileName}</span>
    <span class="tab-close" data-tab-id="${tab.id}">×</span>
    </div>
    `
            )
            .join("");

        this.#setupTabDragAndDrop();
        this.#setupTabClickHandlers();
        this.#setupTabContextMenu();
        this.updateTabActions();
    }

    /**
     * Update tab-actions for a pane
     */
    updateTabActions() {
        const tabActionsElement = this.#element.querySelector(".tab-actions");
        if (!tabActionsElement) return;

        // The HTML template already has buttons, just show/hide them based on state
        const hasAnyTabs = this.#tabs.length > 0;
        const hasMultipleTabs = this.#tabs.length > 1;

        // Show/hide the entire tab actions based on whether we have tabs
        if (!hasAnyTabs) {
            tabActionsElement.style.display = "none";
            return;
        }

        tabActionsElement.style.display = "flex";


        this.#splitVerticalBtn.style.display = hasMultipleTabs ? "block" : "none";
        this.#splitHorizontalBtn.style.display = hasMultipleTabs ? "block" : "none";
        
        const visiblePanes = this.#layout ? this.#layout.panes.filter(p => p.isVisible()).length : 1;
        this.#closePaneBtn.style.display = visiblePanes > 1 ? "block" : "none";
    }

    async closeTab(tabId) {
        const tabIndex = this.#tabs.findIndex((t) => t.id === tabId);
        if (tabIndex === -1) return;

        const tab = this.#tabs[tabIndex];

        // Dispose Monaco model through EditorTab
        tab.dispose();

        this.#tabs.splice(tabIndex, 1);

        // Set new active tab
        if (this.#activeTabId === tabId) {
            if (this.#tabs.length > 0) {
                const newActiveTab = this.#tabs[Math.max(0, tabIndex - 1)];
                await this.setActiveTab(newActiveTab.id);
            } else {
                this.#activeTabId = null;
                if (this.#editor) {
                    this.#editor.setModel(null);
                }
                this.#showPlaceholder();
            }
        }
        this.renderTabs();
        // State updates will be handled through events
    }

    async initialize() {
        commandK.initializeCommandK(this);

        const editorElement = document.getElementById(`monaco-editor-${this.#id}`);
        if (!editorElement || this.#editor) return; // Already initialized

        // Clear any existing content and create Monaco container
        editorElement.innerHTML = '';
        const monacoContainer = document.createElement('div');
        monacoContainer.className = 'monaco-editor';
        monacoContainer.style.cssText = 'width: 100%; height: 100%;';
        editorElement.appendChild(monacoContainer);

        // Load current settings
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

        this.#editor = this.#monaco.editor.create(monacoContainer, editorOptions);

        // Add keyboard shortcuts
        this.#editor.addCommand(this.#monaco.KeyMod.CtrlCmd | this.#monaco.KeyCode.KeyS, async () => {
            this.editerState.saveCurrentFile();
        });

        this.#editor.addCommand(this.#monaco.KeyMod.CtrlCmd | this.#monaco.KeyCode.KeyK, async () => {
            commandK.show();
        });

        this.#setupContentChangeListeners();
        this.#attachToExistingElement();
        this.#setupPaneEventListeners();
        return this.#editor;
    }

    async setActiveTab(tabId) {
        const tab = this.#tabs.find((t) => t.id === tabId);
        if (!tab) return;

        this.#activeTabId = tabId;

        // Update the global active file path so URL gets updated
        this.editerState.activeFilePath = tab.filePath;

        // Check if this file should use renderer instead of Monaco
        if (tab.shouldUseRenderer()) {
            this.#showRendererForTab(tab);
        } else {
            await this.#showMonacoForTab(tab);
        }

        this.renderTabs();
        // State updates will be handled through events
    }

    #attachToExistingElement() {
        // Find existing pane element in DOM
        const paneElement = document.querySelector(`[data-pane="${this.#id}"]`);
        if (!paneElement) {
            console.error(`No existing pane element found for pane ${this.#id}`);
            return;
        }

        this.#element = paneElement;
        this.#splitVerticalBtn = paneElement.querySelector(".split-vertical-btn");
        this.#splitHorizontalBtn = paneElement.querySelector(".split-horizontal-btn");
        this.#closePaneBtn = paneElement.querySelector(".close-pane-btn");
        this.#beautifyBtn = paneElement.querySelector(".beautify-btn");
        this.#gotoLineBtn = paneElement.querySelector(".goto-line-btn");
    }

    #handleFileDeleted(filePath) {
        this.#layout.closeTabsByFilePath(filePath).then(closedTabs => {
            if (closedTabs > 0) {
                this.editerState.emit('showNotification', { message: `File deleted: ${filePath.split('/').pop()}`, type: "warning" });
            }
        }) 
    };

    #setupContentChangeListeners() {
        if (!this.#editor) return;

        // Remove existing listener if any
        if (this.#contentChangeListener) {
            this.#contentChangeListener.dispose();
        }

        // Add new content change listener
        this.#contentChangeListener = this.#editor.onDidChangeModelContent(() => {
            if (this.#activeTabId) {
                // Mark file as modified - EditorTab setter will handle UI updates
                const tab = this.getActiveTab();
                if (tab && !tab.modified) {
                    tab.modified = true; // This automatically triggers renderTabs() - state updates through events
                }
            }
        });
    }

    #setupPaneEventListeners() {
        this.#beautifyBtn.addEventListener("click", () => {
            this.#editor.focus();
            this.#editor.trigger('keyboard', 'editor.action.formatDocument', null);
        });

        this.#gotoLineBtn.addEventListener("click", () => {
            this.#editor.focus();
            this.#editor.trigger('keyboard', 'editor.action.gotoLine', null);
        });

        this.editerState.on('handleFileChanged', (e) => {
            const { filePath, content } = e.detail;
            const tab = this.#tabs.find((tab) => tab.filePath === filePath);
            if (!tab) return;

            const currentContent = tab.getContent();
            
            // If content is identical to what we have, just clear the modified flag
            if (currentContent === content && tab.modified) {
                tab.modified = false; // EditorTab setter handles UI updates
                return;
            }
            
            // If content differs and we have unsaved changes, don't sync
            if (tab.modified) return;
            
            // Content differs and no unsaved changes, apply the sync
            if (currentContent !== content) {
                tab.updateContent(content); // EditorTab handles model update and UI
            }
        });

        this.editerState.on('handleFileDeleted', (e) => {
            const { filePath } = e.detail;
            const tab = this.#tabs.find((tab) => tab.filePath === filePath);
            if (!tab) return;
            
            this.#handleFileDeleted(tab);
        });

        this.editerState.on('panesUpdated', async () => {
            console.log("Pane updated - updating tabs:");

            /*
            Rethinking this method:
            - We should always clear out the tabs and re-add them based on the updatedPane.files
            - Recreate the event listeners for the tabs
            - Set the active tab based on the updatedPane.activeIndex
            - Update the tab actions
            - Update the tab context menu
            - Update the tab drag and drop
            - Update the tab actions
            - Update the tab context menu
            */

            const updatedPane = this.editerState.panes[this.#id];
            if (!updatedPane) return;

            // 0. Clear out the tabs
            this.#tabs = [];

            // 1. Add new tabs from updatedPane.files
            updatedPane.files.forEach((filePath, idx) => {
                const fileName = filePath.split('/').pop() || filePath;
                const tab = new EditorTab(fileName, filePath, this);
                this.#tabs.push(tab);
            });

            // 2. Set active tab based on updatedPane.activeIndex
            if (typeof updatedPane.activeIndex === "number" && this.#tabs[updatedPane.activeIndex]) {
                this.#activeTabId = this.#tabs[updatedPane.activeIndex].id;
            } else if (this.#tabs.length > 0) {
            
                this.#activeTabId = this.#tabs[0].id;
            } else {
                this.#activeTabId = null;
            }

            // 3. Re-render tabs
            this.renderTabs();  
            

            // If no tabs, show placeholder and clear editor
            if (this.#tabs.length === 0) {
                this.#showPlaceholder();
                if (this.#editor) {
                    this.#editor.setModel(null);
                }
            } else {
                // If editor exists, update model to match active tab
                const activeTab = this.getActiveTab();
                if (activeTab) {
                    const model = await activeTab.loadContent();
                    this.#editor.setModel(model);
                }
            }
        });
    }

    #setupTabClickHandlers() {
        const tabs = this.#element.querySelectorAll(".tab");
        tabs.forEach((tab) => {
            // Handle tab click (switch to tab)
            tab.addEventListener("click", (e) => {
                // Don't switch tabs if clicking the close button
                if (e.target.classList.contains("tab-close")) {
                    return;
                }
                const tabId = parseInt(tab.dataset.tab);
                this.setActiveTab(tabId).catch(console.error);
            });

            // Handle close button click separately
            const closeBtn = tab.querySelector(".tab-close");
            if (closeBtn) {
                closeBtn.addEventListener("click", (e) => {
                    e.stopPropagation(); // Prevent tab switch
                    const tabId = parseInt(closeBtn.dataset.tabId);
                    this.closeTab(tabId);
                });
            }
        });
    }

    #setupTabContextMenu() {
        const tabs = this.#element.querySelectorAll(".tab");
        tabs.forEach((tab) => {
            tab.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                const tabId = parseInt(tab.dataset.tab);
                const filePath = tab.dataset.filePath;
                const paneId = this.#id;
                
                // Emit event to show tab context menu
                this.editerState.emit('showTabContextMenu', { 
                    event: e, 
                    paneId, 
                    tabId, 
                    filePath 
                });
            });
        });
    }

    #setupTabDragAndDrop() {
        // TODO: Implement drag and drop for tabs
    }

    #showPlaceholder() {
        const editorElement = document.getElementById(`monaco-editor-${this.#id}`);
        if (editorElement) {
            editorElement.innerHTML = `
                <div class="editor-placeholder" style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888;">
                    <div style="text-align: center;">
                        <div style="font-size: 1.2em; margin-bottom: 8px;">No file open</div>
                        <div style="font-size: 0.9em;">Open a file to start editing</div>
                    </div>
                </div>
            `;
        }
    }

    #showRendererForTab(tab) {
        const editorContent = document.getElementById(`monaco-editor-${this.#id}`);
        if (!editorContent) return;

        // Hide Monaco editor
        const monacoContainer = editorContent.querySelector(".monaco-editor");
        if (monacoContainer) {
            monacoContainer.style.display = "none";
        }

        // Remove existing iframe
        const existingIframe = editorContent.querySelector(".renderer-iframe");
        if (existingIframe) {
            existingIframe.remove();
        }

        // Remove existing placeholder
        const placeholder = editorContent.querySelector(".editor-placeholder");
        if (placeholder) {
            placeholder.remove();
        }

        // Create renderer iframe
        const iframe = document.createElement("iframe");
        iframe.className = "renderer-iframe";
        iframe.src = `/render/${tab.filePath}`;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            background: white;
        `;

        editorContent.appendChild(iframe);
    }

    #handleStateUpdate(statePane) {
        // Get current state
        const currentTabIds = this.#tabs.map(t => t.id);
        const stateTabIds = statePane.tabs.map(t => t.id);
        
        // Remove tabs that are no longer in state
        const tabsToRemove = currentTabIds.filter(id => !stateTabIds.includes(id));
        tabsToRemove.forEach(tabId => {
            const tabIndex = this.#tabs.findIndex(t => t.id === tabId);
            if (tabIndex >= 0) {
                // Properly dispose of the tab
                const tab = this.#tabs[tabIndex];
                if (tab.id === this.#activeTabId && this.#editor) {
                    this.#editor.dispose();
                    this.#editor = null;
                }
                this.#tabs.splice(tabIndex, 1);
            }
        });
        
        // Add new tabs from state
        const tabsToAdd = statePane.tabs.filter(stateTab => !currentTabIds.includes(stateTab.id));
        tabsToAdd.forEach(stateTab => {
            const tab = new EditorTab(stateTab.id, stateTab.fileName, stateTab.filePath, this);
            this.#tabs.push(tab);
        });
        
        // Update active tab
        this.#activeTabId = statePane.activeTabId;
        
        // Re-render UI
        this.renderTabs();
        
        // Set active tab if we have one
        if (this.#activeTabId) {
            this.setActiveTab(this.#activeTabId).catch(console.error);
        } else if (this.#tabs.length === 0) {
            this.#showPlaceholder();
        }
    }

    async #showMonacoForTab(tab) {
        if (!this.#editor) {
            console.warn("Monaco editor failed to initialize for pane", this.#id);
            return;
        }

        // Hide any existing renderer iframe
        const editorContent = document.getElementById(`monaco-editor-${this.#id}`);
        const existingIframe = editorContent?.querySelector(".renderer-iframe");
        if (existingIframe) {
            existingIframe.remove();
        }

        // Show Monaco editor
        const monacoContainer = editorContent?.querySelector(".monaco-editor");
        if (monacoContainer) {
            monacoContainer.style.display = "block";
        }

        // Load content and create Monaco model through EditorTab
        const model = await tab.loadContent(this.#monaco);
        if (model) {
            this.#editor.setModel(model);
        }
    }
}

export default EditorPane;