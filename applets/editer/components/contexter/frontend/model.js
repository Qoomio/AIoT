import qoomEvent from "../../../utils/qoomEvent.js"

class Context {
    constructor(state) {

    }

    showDirectoryMenu(event, path, selection) {
        qoomEvent.emit('showExplorerContextMenu', { event, path, isDirectory: true, selection });
    }

    showFileMenu(event, path, selection) {
        qoomEvent.emit('showExplorerContextMenu', { event, path, isDirectory: false, selection });
    }

    showTabMenu(event, paneId, tabId, filePath) {
        qoomEvent.emit('showTabContextMenu', { event, paneId, tabId, filePath });
    }
}

export default Context