import qoomEvent from '../../../../../utils/qoomEvent.js';
import { getVideoExtensions, getImageExtensions, getAudioExtensions, getDocumentExtensions } from '../../../../../../shared/file-types-config.js';
// Monaco Editor는 전역에서 가져옴

class EditorTab {
    #active = false;
    #deleted = false;
    #error = null;
    #filePath = null;
    #id = null;
    #modified = null;
    #model = null;
    #paneId = null;
    #isActivelyUsed = null;
    #isLoading = null;
    #isSaving = null;
    #isUpdating = null;
    #isTooLarge = false;
    #fileSize = null;

    get active() { return this.#active }
    get content() {
        return this.#model ? this.#model.getValue() : '';
    }
    get error() { return this.#error }
    get filePath() { return this.#filePath; }
    get fileName() { 
        if (this.filePath === 'search://') return 'Search';
        return this.filePath.split('/').pop(); 
    }
    get fileExtension() { return this.fileName.toLowerCase().split('.').pop(); }
    get fileSize() { return this.#fileSize; }
    get id() { return this.#id; }
    get isActivelyUsed() {
        return this.active && !!this.#isActivelyUsed;
    }
    get isBinary() {
        const ext = '.' + this.fileExtension;
        
        // Get all binary extensions from config
        const binaryExtensions = [
            ...getVideoExtensions(),
            ...getImageExtensions(),
            ...getAudioExtensions(),
            ...getDocumentExtensions()
        ];
        
        return binaryExtensions.includes(ext);
    }
    get isDeleted() { return this.#deleted }
    get isLoading() { return this.#isLoading }
    get isSaving() { return this.#isSaving; }
    get isTooLarge() { return this.#isTooLarge; }
    get isUpdating() { return this.#isUpdating; }
    get loaded() { return this.#model !== null }
    get modified() { return this.#modified; }
    get model() { return this.#model; }
    get paneId() { return this.#paneId; }
    

    set active(active) {
        if(this.#active === active) return;
        this.#active = active;
    }

    set content(content) {
        if (this.content === content) return;
        this.#isUpdating = true;
        
        if(this.#isActivelyUsed) clearTimeout(this.#isActivelyUsed);
        this.#model.setValue(content);
        setTimeout(() => {
            this.#isUpdating = false;
        }, 100)
        this.#isActivelyUsed = setTimeout(() => {
            this.#isActivelyUsed = false;
        }, 5000)
    }

    set id(val) {
        if(this.#id === val) return;
        this.#id = val;
    }

    set isSaving(val) {
        if(this.#isSaving === val) return;
        this.#isSaving = val;
        qoomEvent.emit('tabIsSaving', this); 
    }

    set modified(modified) {
        if(modified === this.#modified) return;
        // When watcher updates the file we dont want to mark it modified
        if(this.#isUpdating) return;
        this.#modified = modified;
        qoomEvent.emit('tabModified', this);
    }

    constructor(state) {
        const { filePath, active = false, id, paneId } = state;
        if(!filePath) throw new Error('No filePath provided');
        this.#active = active;
        this.#deleted = false;
        this.#error = null;
        this.#filePath = filePath;
        this.#id = id;
        this.#isActivelyUsed = 0;
        this.#isLoading = false;
        this.#isSaving = false;
        this.#modified = false;
        this.#model = null;
        this.#paneId = paneId;
        this.#isTooLarge = false;
        this.#fileSize = null;
    }
    
    async checkFileSize() {
        try {
            const response = await fetch('/editer/explorer/_api/file-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: this.#filePath })
            });
            
            if (!response.ok) {
                console.warn('Failed to check file size:', response.statusText);
                return false;
            }
            
            const result = await response.json();
            if (result.success && result.data) {
                this.#fileSize = result.data.size;
                this.#isTooLarge = result.data.isTooLarge;
                return true;
            }
            return false;
        } catch (error) {
            console.warn('Error checking file size:', error);
            return false;
        }
    }
    
    async loadContent() {
        // Skip loading for search tab
        if (this.#filePath === 'search://') {
            this.#error = null;
            this.#isLoading = false;
            return qoomEvent.emit('tabContentLoaded', this);
        }
        
        // Check file size first
        await this.checkFileSize();
        
        // Skip loading for binary files or files that are too large
        if(this.isBinary || this.isTooLarge) {
            if (this.isTooLarge) {
                console.log(`File ${this.#filePath} is too large (${this.#fileSize} bytes), skipping Monaco loading`);
            }
            this.#error = null; // Clear any error for binary/large files
            this.#isLoading = false; // Ensure loading state is cleared
            return qoomEvent.emit('tabContentLoaded', this);
        }
        
        try {
            const uri = window.monaco.Uri.file(this.#filePath);
            let existingModel = window.monaco.editor.getModel(uri);
            if (existingModel) {
                this.#model = existingModel;
            } else {
                this.#isLoading = true;
                const response = await fetch(`/view/${this.#filePath}`);
                
                if (!response.ok) {
                    console.error("Failed to load file:", response.statusText);
                    throw new Error('Failed to load file')
                }
                
                const content = await response.text();
                this.#model = window.monaco.editor.createModel(content, undefined, uri);
                this.#error = null;
            }
            qoomEvent.emit('tabContentLoaded', this)
        } catch (error) {
            console.error("Error loading file:", error);
            this.#error = error;
        } finally {
            this.#isLoading = false;
        }
    }

    async getContent() {
        this.#model.getValue();
    }

    async save() {
        if (this.isSaving) return;
        this.isSaving = true;
        try {
            const contentToSave = this.#model.getValue();
            // try {
            //     await createFileVersion(focusedFile, contentToSave);
            //     console.log("Version created successfully for:", focusedFile);
            // } catch (versionError) {
            //     console.warn("Failed to create version:", versionError);
            // }

            const response = await fetch(`/save/${this.filePath}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    content: contentToSave,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || "Save failed");
            }

            const result = await response.json();
            this.modified = false;
        } catch (error) {
            console.error("Error saving file:", error);
            // showSaveNotification("Failed to save file: " + error.message, "error");
        } finally {
            this.isSaving = false;
        }
    }

    equals(tab) {
        return this.paneId === tab.paneId && this.id === tab.id;
    }

    dispose() {
        console.log('DISPOSING', this.#filePath)
        if (this.#model) {
            this.#model.dispose();
            this.#model = null;
        }
    }

    toJSON() {
        return {
            id: this.id,
            fileName: this.fileName,
            filePath: this.filePath,
            modified: this.modified
        };
    }
   
}

export default EditorTab;
