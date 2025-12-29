import ChatPanel from "../components/chat/frontend/model.js";
import Context from "../components/contexter/frontend/model.js";
import ControlBar from "../components/controller/frontend/model.js";
import EditorLayout from "../components/editorLayout/frontend/model.js";
import ExplorePanel from "../components/explorer/frontend/model.js"
import MoncacoSettings from "../components/monaco-settings/frontend/model.js"
import NotificationBar from "../components/notifier/frontend/model.js"
import PreviewPanel from "../components/previewer/frontend/model.js"
import VersionHistoryModal from "../components/versioner/frontend/model.js"
import qoomEvent from "../utils/qoomEvent.js"

class Editer {
    #event = null;

    // Component Models
    #chat = null;
    #context = null;
    #controlBar = null;
    #explorer = null;
    #history = null;
    #layout = null;
    #monacoSettings = null;
    #notificationBar = null;
    #preview = null;
   
    get activeFilePath() {
        return this.#layout.activePane.activeTab.filePath;
    }

    get activeTab() {
        return this.#layout.activePane.activeTab
    }

    get chat() {
        return this.#chat;
    }

    get context() {
        return this.#context;
    }

    get controlBar() {
        return this.#controlBar;
    }

    get explorer() {
        return this.#explorer;
    }

    get history() {
        return this.#history;
    }

    get layout() {
        return this.#layout;
    }

    get monacoSettings() {
        return this.#monacoSettings;
    }

    get notificationBar() {
        return this.#notificationBar;
    }

    get preview() {
        return this.#preview;
    }

    get previewPanelHidden() {
        return !this.activeTab || this.activeTab.isBinary || this.activeTab.isTooLarge;
    }

    constructor(state) {
        this.#event = qoomEvent;

        // Constructing Component Models
        this.#chat = new ChatPanel(state.chat)
        this.#context = new Context(state.context);
        this.#controlBar = new ControlBar(state.controller);
        this.#explorer = new ExplorePanel(state.explorer);
        this.#history = new VersionHistoryModal(state.history)
        this.#layout = new EditorLayout(state.layout);
        this.#monacoSettings = new MoncacoSettings(state.monacoSettings);
        this.#notificationBar = new NotificationBar(state.notificationBar)
        this.#preview = new PreviewPanel(state.preview);
    }

    fileRenamed() {
        qoomEvent.emit('fileRenamed');
    }

    fileDeleted(){
        qoomEvent.emit('fileDeleted');
    }

    openFileAtLine(fileName, filePath, line, column) {
        qoomEvent.emit('openFileAtLine', { fileName, filePath, line, column })
    }


    toString() {
        return JSON.stringify(this, null, 2);
    }
}

export default Editer;