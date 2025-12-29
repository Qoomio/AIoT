let qoomEvent;

class QoomEvent {
    #emitDebounceTimers = null;

    constructor() {
        this.#emitDebounceTimers = {};
    }

    on(eventName, callback) {
        window.addEventListener(eventName, callback);
    }
    off(eventName, callback) {
        window.removeEventListener(eventName, callback);
    }

    emit(eventName, data, debounce = 0) {
        function emitEvent() {
            const event = new CustomEvent(eventName, { detail: data });
            window.dispatchEvent(event);
        }

        if (!debounce) {
            emitEvent();
            return;
        }
        
        if (this.#emitDebounceTimers[eventName]) {
            clearTimeout(this.#emitDebounceTimers[eventName]);
        }
        this.#emitDebounceTimers[eventName] = setTimeout(() => {
            emitEvent();
            this.#emitDebounceTimers[eventName] = null;
        }, debounce);
    }

}

qoomEvent = qoomEvent || new QoomEvent();

export default qoomEvent;