import qoomEvent from "../../../utils/qoomEvent.js"

class MonacoSettings {
    constructor(state) {

    }

    show() {
        qoomEvent.emit('showMonacoSettings');
    }

}

export default MonacoSettings