/**
 * Admin Dashboard Frontend JavaScript
 * Handles dynamic loading of applet cards and user interactions
 */

import { inject as injectNavigater } from '/view/applets/navigater/frontend/navigater.js';

/**
 * Load applets data from the API and render cards
 */
async function loadApplets() {
    const contentDiv = document.getElementById('applets-content');
    
    try {
        const response = await fetch('/admin/api/applets');
        const result = await response.json();
        
        if (result.success) {
            renderApplets(result.data.applets);
        } else {
            showError('Failed to load applets: ' + result.error);
        }
    } catch (error) {
        console.error('Error loading applets:', error);
        showError('Network error loading applets');
    }
}

/**
 * Render applet cards in the UI
 * @param {Array} applets - Array of applet configurations
 */
function renderApplets(applets) {
    const contentDiv = document.getElementById('applets-content');
    
    if (applets.length === 0) {
        contentDiv.innerHTML = '<div class="no-applets">No applets with admin.json configurations found.</div>';
        return;
    }
    contentDiv.innerHTML = '';
    contentDiv.classList.add('applets-grid');
    applets.forEach(applet => {
        const card = document.createElement('div');
        card.className = 'applet-card';
        card.innerHTML = `<h3 class="applet-title">${applet.title}</h3>`;
        card.addEventListener('click', () => navigateToApplet(applet.onclick));
        contentDiv.appendChild(card);
    });
}

/**
 * Navigate to applet URL
 * @param {string} url - URL to navigate to
 */
function navigateToApplet(url) {
    window.location.href = url;
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    const contentDiv = document.getElementById('applets-content');
    contentDiv.innerHTML = `<div class="error">${message}</div>`;
}

loadApplets();
injectNavigater('administrater');