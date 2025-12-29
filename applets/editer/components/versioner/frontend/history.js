/**
 * Version History Modal JavaScript
 * 
 * Handles the version history modal functionality including:
 * - Loading and displaying version history
 * - Version preview and content display
 * - Rollback operations
 * - Modal UI interactions
 */

"use strict";
import qoomEvent from "../../../utils/qoomEvent.js"

let state = null;


async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="history.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/versioner/frontend/history.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load History CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
    try {
        // Load the modal HTML template
        const response = await fetch('/view/applets/editer/components/versioner/frontend/history.html');
        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);
        
        console.log('Version history modal initialized');
    } catch (error) {
        console.error('Failed to initialize version history modal:', error);
    }
}

async function initialize(_state) {
    state = _state;
    await injectCSS();
    await injectHTML(); 

    // const versionHistoryModal = new VersionHistoryModal();
    // versionHistoryModal.initialize();
    // qoomEvent.on('showVersionHistoryModal', () => {
    //     versionHistoryModal.show();
    // });
    console.log('History initialized');
}

export {
    initialize
}