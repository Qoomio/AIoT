import qoomEvent from "../../../utils/qoomEvent.js"
import EditorPane from '../editorPane/frontend/model.js';

// Store pending navigation requests
const pendingNavigations = new Map();
// Store search highlight decorations per pane
const searchHighlightDecorations = new Map();
// Store highlight clear timers per pane
const searchHighlightTimers = new Map();

class EditorLayout {
    #layout = 'single';
    #layouts = ['single', 'vertical', 'horizontal', 'quad'];
    #panes = null;

    get activePane() {
        const activePane = this.panes.find(pane => pane.active);
        if(activePane) return activePane;

        this.#panes[0].active = true;
        return this.#panes[0]; 
    }

    get layout() {
        return this.#layout;
    }

    get layouts() {
        return this.#layouts;
    }

    get panes() {
        return this.#panes;
    }

    set activeFilePath(filePath) {
        const tabIndexToActivate = this.activePane.tabs.findIndex(tab => tab.filePath === filePath);
        if(tabIndexToActivate > -1) {
            this.activePane.activateTab(tabIndexToActivate);
            return;
        }
        this.activePane.addTab(filePath);
    }

    set layout(layout) {
        if(layout === this.#layout) return;
        if(!this.#layouts.includes(layout)) return;
        this.#layout = layout;
    }

    set panes(panes) {
        panes.forEach((pane,i) => {
            const editorPane = this.#panes[i];
            pane.files.forEach((file) => {
                editorPane.addTab(file);
            })
            editorPane.activateTab(pane.activeIndex || 0);
        })
    }
    

    constructor(state)
    {

        const {
            activeFilePath,
            layout = 'single',
            panes = [],
        } = state;

        if(!activeFilePath) throw new Error('No activeFilePath provided');
        this.#layout = layout;
        this.#panes = [];
        for(let i = 0; i < 4; i++) {
            const pane = new EditorPane({...panes[i] || {}, active: i === 0, id: i });
            this.#panes.push(pane);
        }

        this.activeFilePath = activeFilePath;
       
    }
    
    activatePane(id)  {
        const pane = this.#panes[id];
        if(!pane) return;

        this.#panes.forEach(pane => pane.active === false);
        pane.active = true;
    }

    openFile(fileName, filePath) {
        // Check if file is already open in any pane
        for (const pane of this.#panes) {
            const existingTab = pane.tabs.find(tab => tab.filePath === filePath);
            if (existingTab) {
                pane.activateTab(existingTab.id);
                return existingTab;
            }
        }
        
        // Open in active pane
        this.activePane.addTab(filePath);
        return this.activePane.activeTab;
    }

    async openFileAtLine(fileName, filePath, lineNumber, columnNumber = 1, searchTerm = null, searchOptions = null, matchText = null) {
        // Open or activate the file
        const tab = this.openFile(fileName, filePath);
        
        if (!tab || !lineNumber) {
            return tab;
        }

        // Store navigation info
        const navInfo = { 
            line: parseInt(lineNumber), 
            column: parseInt(columnNumber || 1),
            filePath: filePath,
            searchTerm: searchTerm,
            searchOptions: searchOptions,
            matchText: matchText
        };
        pendingNavigations.set(filePath, navInfo);

        // Function to navigate to line
        const navigateToLine = () => {
            const nav = pendingNavigations.get(filePath);
            if (!nav) return;

            const pane = this.#panes.find(p => p.tabs.some(t => t.filePath === filePath));
            if (!pane) {
                // Try again if pane not found
                setTimeout(navigateToLine, 100);
                return;
            }

            // Get the DOM element for this pane
            const $pane = document.querySelector(`[data-pane="${pane.id}"]`);
            if (!$pane || !$pane.editor) {
                // Editor not ready yet, try again
                setTimeout(navigateToLine, 100);
                return;
            }

            try {
                const editor = $pane.editor;
                const model = editor.getModel();
                
                // Navigate to line
                editor.setPosition({ 
                    lineNumber: nav.line, 
                    column: nav.column 
                });
                editor.revealLineInCenter(nav.line);
                
                // Highlight search term if provided
                if (nav.searchTerm && model) {
                    highlightSearchTerm(editor, model, nav, pane.id);
                }
                
                // Clear navigation info after successful navigation
                pendingNavigations.delete(filePath);
            } catch (e) {
                console.warn("Could not navigate to line:", e);
                pendingNavigations.delete(filePath);
            }
        };

        // If tab is already loaded, navigate immediately
        if (tab.model) {
            setTimeout(navigateToLine, 100);
        } else {
            // Listen for tab content loaded event
            const handler = (e) => {
                const loadedTab = e.detail;
                if (loadedTab && loadedTab.filePath === filePath) {
                    setTimeout(navigateToLine, 200);
                    qoomEvent.off('tabContentLoaded', handler);
                }
            };
            qoomEvent.on('tabContentLoaded', handler);
        }

        return tab;
    }
}

/**
 * Highlight only the clicked search result in Monaco editor
 */
function highlightSearchTerm(editor, model, nav, paneId) {
    if (!nav?.searchTerm || !model || !editor) return;
    
    try {
        const { line, column, matchText, searchTerm } = nav;
        const textToHighlight = matchText || searchTerm;
        if (!textToHighlight) return;
        
        const startColumn = parseInt(column || 1);
        const endColumn = startColumn + textToHighlight.length;
        
        const range = new window.monaco.Range(
            parseInt(line),
            startColumn,
            parseInt(line),
            endColumn
        );
        
        const decorations = [{
            range,
            options: {
                inlineClassName: 'search-result-highlight',
                stickiness: window.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                zIndex: 10,
                overviewRuler: {
                    color: '#ff8c00',
                    position: window.monaco.editor.OverviewRulerLane.Full
                }
            }
        }];
        
        // Remove old decorations and add new ones
        const oldDecorations = searchHighlightDecorations.get(paneId) || [];
        const newDecorationIds = editor.deltaDecorations(oldDecorations, decorations);
        searchHighlightDecorations.set(paneId, newDecorationIds);
        
        // Clear existing timer for this pane to avoid clearing new highlights too early
        const existingTimer = searchHighlightTimers.get(paneId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        
        // Clear decorations after 5 seconds
        const timerId = setTimeout(() => {
            const currentDecorations = searchHighlightDecorations.get(paneId);
            if (currentDecorations && currentDecorations.length > 0) {
                editor.deltaDecorations(currentDecorations, []);
                searchHighlightDecorations.delete(paneId);
            }
            searchHighlightTimers.delete(paneId);
        }, 5000);
        searchHighlightTimers.set(paneId, timerId);
        
    } catch (e) {
        console.error("Could not highlight search term:", e);
    }
}

export default EditorLayout;