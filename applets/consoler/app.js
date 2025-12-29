/**
 * Consoler App - Main route handler for /console
 * Serves the console monitoring interface
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate the main consoler HTML page by reading from frontend file
 */
function generateConsolerHTML() {
    const fullPath = path.join(__dirname, 'frontend', 'console.html');
    const html = fs.readFileSync(fullPath, 'utf8');
    return html;
}

/**
 * Handle /console route
 */
function handleConsoleRoute(req, res) {
    try {
        const html = generateConsolerHTML();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    } catch (error) {
        console.error('Error serving console page:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
}

// Export the handler function for use by api.js
export {
    handleConsoleRoute,
    generateConsolerHTML
};