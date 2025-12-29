import qoomEvent from "../../../utils/qoomEvent.js"

class ExplorePanel {
    #collapsed = null;
    #width = null;

    get collapsed() {
        return this.#collapsed;
    }

    get width() {
        return this.#width;
    }

    set collapsed(val) {
        if (this.#collapsed === val) return;
        this.#collapsed = val;

        qoomEvent.emit('explorerPanelCollapsed', this.#collapsed);
    }

    set width(val) {
        if (this.#width === val) return;
        this.#width = val;

        qoomEvent.emit('explorerWidthChanged', this.#width);
    }

    constructor(state) {
        const { 
            collapsed,
            width,
        } = state;

        this.#collapsed = collapsed;
        this.#width = width;
    }

    createFile(path) {
        qoomEvent.emit('createFile', path)
    }

    createFolder(path) {
        qoomEvent.emit('createFolder', path)
    }

    deleteDirectory(path) {
        qoomEvent.emit('deleteDirectory', path)
    }

    deleteFile(path) {
        qoomEvent.emit('deleteFile', path);
    }

    downloadDirectory(path) {
        qoomEvent.emit('downloadDirectory', path)
    }

    downloadFile(path) {
        qoomEvent.emit('downloadFile', path);
    }

    duplicateDirectory(path) {
        qoomEvent.emit('duplicateDirectory', path)
    }

    duplicateFile(path) {
        qoomEvent.emit('duplicateFile', path);
    }

    openInTerminal(path, isDirectory, root) {
        qoomEvent.emit('openInTerminal', { path, isDirectory, root});
    }

    renameDirectory(path) {
        qoomEvent.emit('renameDirectory', path)
    }

    renameFile(path) {
        qoomEvent.emit('renameFile', path);
    }

    toggleCollapsed() {
        this.collapsed = !this.collapsed;
    }

    uploadFiles(path) {
        qoomEvent.emit('uploadFiles', path);
    }

    uploadFolder(path) {
        qoomEvent.emit('uploadFolder', path);
    }
}

export default ExplorePanel