import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple local implementation of logActivity
function logActivity(source, action, details = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${source}: ${action}`, details);
}
        
/**
 * Log terminal activity
 * @param {string} sessionId - Terminal session ID
 * @param {string} action - Action performed
 */
function logTerminalActivity(sessionId, action) {
    logActivity('terminaler', `Session ${sessionId}: ${action}`);
}

function generateTerminalHTML() {
    const fullPath = path.join(__dirname, 'frontend', 'terminal.html');
    const html = fs.readFileSync(fullPath, 'utf8');
    return html;
}

export {
    generateTerminalHTML,
    logTerminalActivity
};