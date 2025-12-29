import qoomEvent from "../../../utils/qoomEvent.js"

class ChatPanel {
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

        qoomEvent.emit('chatPanelCollapsed', this.#collapsed);
    }

    set width(val) {
        if (this.#width === val) return;
        this.#width = val;

        qoomEvent.emit('chatWidthChanged', this.#width);
    }

    constructor(state) {
        const { 
            collapsed,
            width,
        } = state;

        this.#collapsed = collapsed;
        this.#width = width;


    }

    toggleCollapsed() {
        this.collapsed = !this.collapsed;
    }
}

export default ChatPanel