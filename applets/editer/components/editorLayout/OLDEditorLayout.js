import EditorPane from '../editorPane/EditorPane.js';

class EditorLayout {
    #panes = [];
    #container;
    #editerState;

    get panes() { return this.#panes; }
    get editerState() { return this.#editerState; }

    constructor(container, editerState) {
        this.#container = container;
        this.#editerState = editerState;
        this.#panes = [];
    }

    async initialize() {
        for (let i = 0; i < 4; i++) {
            const paneElement = this.#container.querySelector(`[data-pane="${i}"]`);
            if (paneElement) {
                const pane = new EditorPane({ 
                    id: i, 
                    activeIndex: 0, 
                    tabs: [] 
                }, this.#editerState.monaco, this);
                await pane.initialize();
                
                this.#setupPaneEventListeners(pane);
                this.#panes.push(pane);
            }
        }
        this.#setupEditerStateEventListeners();
        this.setLayout('single');
    }

    // Add this method to control pane visibility
    setLayout(layoutType) {
        const container = this.#container;
        container.setAttribute('data-layout', layoutType);
        
        // Define which panes are visible for each layout
        const layouts = {
            'single': [0], // Only pane 0
            'vertical': [0, 1], // Panes 0 and 1 (side by side)
            'horizontal': [0, 2], // Panes 0 and 2 (top and bottom)
            'quad': [0, 1, 2, 3] // All 4 panes (2x2 grid)
        };
        
        const visiblePanes = layouts[layoutType] || [0];
        
        // Show/hide panes based on layout
        this.#panes.forEach((pane, index) => {
            const shouldBeVisible = visiblePanes.includes(index);
            const paneElement = pane.element;
            
            if (paneElement) {
                paneElement.style.display = shouldBeVisible ? 'flex' : 'none';
            }
        });
        
        // Update close button visibility
        this.#panes.forEach(pane => {
            if (pane.element) {
                pane.updateTabActions();
            }
        });
    }

    async #moveTabBetweenPanes(sourcePaneId, targetPaneId, tabId) {
        const sourcePane = this.getPaneById(sourcePaneId);
        const targetPane = this.getPaneById(targetPaneId);
    
        if (!sourcePane || !targetPane) return;
    
        // Find the tab to move in the UI pane
        const tabToMove = sourcePane.tabs.find((t) => t.id === tabId);
        if (!tabToMove) return;
    
        // Get tab information
        const fileName = tabToMove.fileName;
        const filePath = tabToMove.filePath;
    
        // Update editerState directly - this will trigger events automatically
        const sourceStatePane = this.#editerState.panes.find(p => p.id === sourcePaneId);
        const targetStatePane = this.#editerState.panes.find(p => p.id === targetPaneId);
    
        if (sourceStatePane && targetStatePane) {
            // Remove tab from source pane state
            sourceStatePane.tabs = sourceStatePane.tabs.filter(tab => tab.id !== tabId);
            if (sourceStatePane.activeTabId === tabId) {
                sourceStatePane.activeTabId = sourceStatePane.tabs.length > 0 ? sourceStatePane.tabs[0].id : null;
            }
    
            // Add tab to target pane state with new ID
            const newTabData = {
                fileName: fileName,
                filePath: filePath
            };
            targetStatePane.tabs.push(newTabData);
            targetStatePane.activeTabId = newTabData.id;
        }
    }

    #splitPaneVertical(sourcePaneId) {
        const sourcePane = this.getPaneById(sourcePaneId);
        if (!sourcePane || !sourcePane.activeTabId) return;

        const activeTab = sourcePane.getActiveTab();
        if (!activeTab) return;

        const currentLayout = this.#editerState.layout;
        let newLayout, targetPaneId;
        
        if (currentLayout === 'single') {
            newLayout = 'vertical';
            targetPaneId = 1;
        } else if (currentLayout === 'horizontal') {
            newLayout = 'quad';
            targetPaneId = 3;
        } else {
            return; // Already at max panes
        }

        this.setLayout(newLayout);
        this.#editerState.layout = newLayout;
        
        setTimeout(() => {
            this.#moveTabBetweenPanes(sourcePaneId, targetPaneId, activeTab.id);
        }, 100);
    }


    #splitPaneHorizontal(sourcePaneId) {
        const sourcePane = this.getPaneById(sourcePaneId);
        if (!sourcePane || !sourcePane.activeTabId) return;

        const activeTab = sourcePane.getActiveTab();
        if (!activeTab) return;

        const currentLayout = this.#editerState.layout;
        let newLayout, targetPaneId;
        
        if (currentLayout === 'single') {
            newLayout = 'horizontal';
            targetPaneId = 2;
        } else if (currentLayout === 'vertical') {
            newLayout = 'quad';
            targetPaneId = 2;
        } else {
            return; // Already at max panes
        }

        this.setLayout(newLayout);
        this.#editerState.layout = newLayout;
        
        setTimeout(() => {
            this.#moveTabBetweenPanes(sourcePaneId, targetPaneId, activeTab.id);
        }, 100);
    }

    #setupPaneEventListeners(pane) {
        pane.splitVerticalBtn.addEventListener('click', () => {
            this.#splitPaneVertical(pane.id);
        });

        pane.splitHorizontalBtn.addEventListener('click', () => {
            this.#splitPaneHorizontal(pane.id);
        });

        pane.closePaneBtn.addEventListener('click', () => {
            this.#closePaneIfAllowed(pane.id);
        });
    }

    #setupEditerStateEventListeners() {
        this.#editerState.on('panesSet', (e) => {
            const panes = e.detail;
            console.log('setupEditerStateEventListeners', panes);
            // Update the panes' tabs and active tab state based on the new panes array
            for (let i = 0; i < this.#panes.length; i++) {
                const pane = this.#panes[i];

                if (!pane) {
                    // Hide unused panes
                    pane.setTabs([]);
                    if (!paneState) {
                        // Hide unused panes
                        pane.setTabs([]);
                        pane.setActiveTabId(null);
                        if (pane.element) {
                            pane.element.style.display = 'none';
                        }
                        continue;
                    }
                    pane.setActiveTabId(null);
                    if (pane.element) {
                        pane.element.style.display = 'none';
                    }
                    continue;
                }

                // Set tabs for this pane
                const tabs = (paneState.tabs || []).map(tab => ({
                    ...tab
                }));
                pane.setTabs(tabs);

                // Set active tab
                if (paneState.activeTabId !== undefined && paneState.activeTabId !== null) {
                    pane.setActiveTabId(paneState.activeTabId);
                } else if (tabs.length > 0) {
                    pane.setActiveTabId(tabs[0].id);
                } else {
                    pane.setActiveTabId(null);
                }

                // Show pane if it has tabs
                if (pane.element) {
                    pane.element.style.display = tabs.length > 0 ? 'flex' : 'none';
                }
            }
        });
    }

    getPaneById(id) {
        return this.#panes.find((pane) => pane.id === id);
    }

    // Obsolete methods removed - using initializeAllPanes() and setLayout() instead

    #closePaneIfAllowed(paneId) {
        // Only allow closing if there are multiple visible panes
        const visiblePanes = this.#panes.filter(pane => pane.isVisible());
        if (visiblePanes.length <= 1) {
            return; // Don't close the last pane
        }

        const pane = this.getPaneById(paneId);
        if (pane) {
            pane.element.style.display = 'none';
            // TODO: Handle tab redistribution when closing panes
        }
    }

    getAvailableSplitDirections(paneId) {
        const directions = [];
        const layout = this.#editerState.layout;

        switch (layout) {
            case "single":
                if (paneId === 0) {
                    directions.push("right", "down");
                }
                break;

            case "vertical":
                if (paneId === 0) {
                    directions.push("right", "down");
                } else if (paneId === 1) {
                    directions.push("left", "down");
                }
                break;

            case "horizontal":
                if (paneId === 0) {
                    directions.push("right", "down");
                } else if (paneId === 1) {
                    directions.push("right", "up");
                }
                break;

            case "quad":
                if (paneId === 0) {
                    directions.push("right", "down");
                } else if (paneId === 1) {
                    directions.push("left", "down");
                } else if (paneId === 2) {
                    directions.push("right", "up");
                } else if (paneId === 3) {
                    directions.push("left", "up");
                }
                break;
        }

        return directions;
    }

    async openFile(fileName, filePath) {
        // Open file in first available pane
        if (this.#panes.length > 0) {
            return await this.#panes[0].addTab(fileName, filePath);
        }
    }

    async openFileAtLine(fileName, filePath, lineNumber, columnNumber = 1) {
        const tab = await this.openFile(fileName, filePath);
        if (tab && this.#panes[0].editor && lineNumber) {
            setTimeout(() => {
                try {
                    this.#panes[0].editor.setPosition({ 
                        lineNumber: parseInt(lineNumber), 
                        column: parseInt(columnNumber) 
                    });
                    this.#panes[0].editor.revealLineInCenter(parseInt(lineNumber));
                } catch (e) {
                    console.warn("Could not navigate to line:", e);
                }
            }, 100);
        }
        return tab;
    }

    async closeTabsByFilePath(filePath) {
        let closedTabs = 0;
        
        for (const pane of this.#panes) {
            const tabsToClose = pane.tabs.filter(tab => 
                tab.filePath === filePath || tab.fileName === filePath
            );
            
            for (const tab of tabsToClose) {
                await pane.closeTab(tab.id);
                closedTabs++;
            }
        }
        
        return closedTabs;
    }

    async closeAllOtherTabs(paneId, keepTabId) {
        const pane = this.getPaneById(paneId);
        if (!pane) return 0;
        
        const tabsToClose = pane.tabs.filter(tab => tab.id !== keepTabId);
        let closedCount = 0;
        
        for (const tab of tabsToClose) {
            await pane.closeTab(tab.id);
            closedCount++;
        }
        
        return closedCount;
    }
       
}

export default EditorLayout;