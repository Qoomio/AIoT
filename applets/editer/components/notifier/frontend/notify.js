
import qoomEvent from "../../../utils/qoomEvent.js"

let state = null;
let notificationContainer = null;

function show(e) {
    const { message, type } = e.detail;
	const notification = document.createElement('div');
	notification.className = `notification notification-${type}`;
	notification.textContent = message;

	notificationContainer.innerHTML = '';
	notificationContainer.appendChild(notification);

	setTimeout(() => notification.remove(), 3000);
}

async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="notify.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/notifier/frontend/notify.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load Notify CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
    try {
        const response = await fetch("/view/applets/editer/components/notifier/frontend/notify.html");
        const html = await response.text();
        notificationContainer = document.querySelector(".notification-container");
        if (!notificationContainer) {
            const div = document.createElement('div');
            div.innerHTML = html;
            notificationContainer = div.querySelector('div');
            document.body.appendChild(notificationContainer);
        }
    } catch (error) {
        console.error("Failed to load notifier template:", error);
    }
}

async function initialize(state) {
    state = state;
    await injectCSS();
    await injectHTML();
    
    // Listen for context menu events
    qoomEvent.on('showNotification', show);
    
    console.log('Notifier initialized');
}

export {
    initialize
}