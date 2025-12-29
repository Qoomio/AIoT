import qoomEvent from "../../../utils/qoomEvent.js"

class Context {
    constructor(state) {

    }

    showDirectoryMenu(event, path) {
        qoomEvent.emit('showExplorerContextMenu', { event, path, isDirectory: true });
    }

    showFileMenu(event, path) {
        qoomEvent.emit('showExplorerContextMenu', { event, path, isDirectory: false });
    }

    showTabMenu(event, paneId, tabId, filePath) {
        qoomEvent.emit('showTabContextMenu', { event, paneId, tabId, filePath });
    }
}

export default Context