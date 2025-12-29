let nextTabId = 0;

class EditorTab {
    #id;
    #fileName;
    #filePath;
    #modified;
    #model;
    #pane;

    constructor(fileName, filePath, pane) {
        this.#id = ++nextTabId;
        this.#fileName = fileName;
        this.#filePath = filePath;
        this.#modified = false;
        this.#pane = pane;
        this.#model = null;
    }

    // Getters
    get id() { return this.#id; }
    get fileName() { return this.#fileName; }
    get filePath() { return this.#filePath; }
    get modified() { return this.#modified; }
    get model() { return this.#model; }

    // Setters with side effects
    set modified(value) {
        this.#modified = value;
        // Automatically trigger UI updates when modified state changes
        this.#pane.renderTabs();
        // State updates will be handled through events
    }

    set model(value) {
        this.#model = value;
    }

    /**
     * Load file content and create Monaco model
     */
    async loadContent() {
        
        if (this.#model) return this.#model;

        const monaco = this.#pane.monaco;
        try {
            
            const response = await fetch(`/view/${this.#filePath}`);
            if (!response.ok) {
                console.error("Failed to load file:", response.statusText);
                return null;
            }
            
            const content = await response.text();
            const uri = monaco.Uri.file(this.#filePath || this.#fileName);

            let existingModel = monaco.editor.getModel(uri);
            if (existingModel) {
                this.#model = existingModel;
            } else {
                this.#model = monaco.editor.createModel(content, undefined, uri);
            }
            return this.#model;
        } catch (error) {
            console.error("Error loading file:", error);
            return null;
        }
    }

    /**
     * Get current content from Monaco model
     */
    getContent() {
        
    }

    // BELONGS IN TAB COMPONENT
    // WE WILL UPDATE THE MODEL VIA AN EVENT HANDLER
    updateContent(content) {
        if (this.#model) {
            this.#model.setValue(content);
            this.#modified = false; // Content is now synced
            // Trigger UI updates
            this.#pane.renderTabs();
            // State updates will be handled through events
        }
    }

    // BELONGS IN PREVIEWER
    shouldUseRenderer() {
        const ext = this.#fileName.toLowerCase().split(".").pop();
        const rendererExtensions = [
            // Images
            "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico",
            // Videos
            "mp4", "webm", "avi", "mov", "mkv", "wmv", "flv",
            // Audio
            "mp3", "wav", "ogg", "m4a", "aac", "flac",
            // Documents
            "pdf",
        ];
        return rendererExtensions.includes(ext);
    }

    /**
     * Dispose of Monaco model when tab is closed
     */
    dispose() {
        if (this.#model) {
            this.#model.dispose();
            this.#model = null;
        }
    }

    /**
     * Serialize tab data for state management
     */
    toJSON() {
        return {
            id: this.#id,
            fileName: this.#fileName,
            filePath: this.#filePath,
            modified: this.#modified
        };
    }
}

export default EditorTab;
