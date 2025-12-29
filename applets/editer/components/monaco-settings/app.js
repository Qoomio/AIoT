/**
 * Monaco Settings Module Helper Functions
 * 
 * This module provides helper functions for Monaco Editor settings management.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Monaco settings storage (in-memory for now, but can be persisted to file)
let monacoSettings = {
    theme: "vs-dark",
    fontSize: 14,
    lineNumbers: "on",
    minimap: { enabled: true },
    wordWrap: "on",
    tabSize: 4,
    insertSpaces: true,
    autoIndent: "advanced",
    scrollBeyondLastLine: false,
    cursorBlinking: "blink",
    cursorStyle: "line",
    renderWhitespace: "all",
    matchBrackets: "always",
    folding: true,
    showFoldingControls: "mouseover",
    automaticLayout: true,
    detectIndentation: true,
    trimAutoWhitespace: true,
    wordBasedSuggestions: "allDocuments",
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: "on",
    rulers: [],
    bracketPairColorization: true,
    smoothScrolling: false,
    mouseWheelZoom: false
};

// Load settings from file on startup
function loadMonacoSettings() {
    const settingsPath = path.join(__dirname, 'monaco-settings.json');
    try {
        if (fs.existsSync(settingsPath)) {
            const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            monacoSettings = { ...monacoSettings, ...savedSettings };
            console.log('Monaco settings loaded from file:', settingsPath);
        } else {
            console.log('Monaco settings file not found, using defaults:', settingsPath);
        }
    } catch (error) {
        console.error('Error loading Monaco settings:', error);
    }
}

// Save settings to file
function saveMonacoSettings(settings) {
    const settingsPath = path.join(__dirname, 'monaco-settings.json');
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log('Monaco settings saved to file:', settingsPath);
    } catch (error) {
        console.error('Error saving Monaco settings:', error);
        throw error;
    }
}

/**
 * Get Monaco editor settings
 */
async function getMonacoSettings(req, res) {
    try {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            data: monacoSettings
        }));
    } catch (error) {
        console.error('Error getting Monaco settings:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            error: 'Failed to get Monaco settings'
        }));
    }
}

/**
 * Update Monaco editor settings
 */
async function updateMonacoSettings(req, res) {
    console.log('Updating Monaco settings - request received');
    console.log('Request method:', req.method);
    console.log('req.body:', req.body);
    
    try {
        // The body is already parsed by server.js and available as req.body
        const updates = req.body;
        
        if (!updates) {
            throw new Error('No request body received');
        }
        
        console.log('Updates:', updates);
        
        // Validate and update settings
        const validatedSettings = validateMonacoSettings(updates);
        console.log('Validated settings:', validatedSettings);
        
        monacoSettings = { ...monacoSettings, ...validatedSettings };
        
        // Save to file
        saveMonacoSettings(monacoSettings);
        
        console.log('Settings saved successfully');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            data: monacoSettings
        }));
        
    } catch (error) {
        console.error('Error updating Monaco settings:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            error: 'Failed to update Monaco settings: ' + error.message
        }));
    }
}

/**
 * Validate Monaco settings
 */
function validateMonacoSettings(settings) {
    const validated = {};
    
    // Theme validation
    if (settings.theme && ['vs', 'vs-dark', 'hc-black', 'hc-light'].includes(settings.theme)) {
        validated.theme = settings.theme;
    }
    
    // Font size validation
    if (settings.fontSize && typeof settings.fontSize === 'number' && settings.fontSize >= 8 && settings.fontSize <= 72) {
        validated.fontSize = settings.fontSize;
    }
    
    // Line numbers validation
    if (settings.lineNumbers && ['on', 'off', 'relative', 'interval'].includes(settings.lineNumbers)) {
        validated.lineNumbers = settings.lineNumbers;
    }
    
    // Word wrap validation
    if (settings.wordWrap && ['on', 'off', 'wordWrapColumn', 'bounded'].includes(settings.wordWrap)) {
        validated.wordWrap = settings.wordWrap;
    }
    
    // Tab size validation
    if (settings.tabSize && typeof settings.tabSize === 'number' && settings.tabSize >= 1 && settings.tabSize <= 8) {
        validated.tabSize = settings.tabSize;
    }
    
    // Boolean settings
    const booleanSettings = [
        'insertSpaces', 'scrollBeyondLastLine', 'automaticLayout', 
        'detectIndentation', 'trimAutoWhitespace', 'folding',
        'bracketPairColorization', 'smoothScrolling', 'mouseWheelZoom',
        'quickSuggestions', 'suggestOnTriggerCharacters'
    ];
    
    booleanSettings.forEach(setting => {
        if (typeof settings[setting] === 'boolean') {
            validated[setting] = settings[setting];
        }
    });
    
    // Minimap settings
    if (settings.minimap && typeof settings.minimap === 'object') {
        validated.minimap = {};
        if (typeof settings.minimap.enabled === 'boolean') {
            validated.minimap.enabled = settings.minimap.enabled;
        }
        if (settings.minimap.scale && typeof settings.minimap.scale === 'number' && settings.minimap.scale >= 1 && settings.minimap.scale <= 3) {
            validated.minimap.scale = settings.minimap.scale;
        }
        if (settings.minimap.showSlider && ['always', 'mouseover'].includes(settings.minimap.showSlider)) {
            validated.minimap.showSlider = settings.minimap.showSlider;
        }
    }
    
    // Cursor settings
    if (settings.cursorBlinking && ['blink', 'smooth', 'phase', 'expand', 'solid'].includes(settings.cursorBlinking)) {
        validated.cursorBlinking = settings.cursorBlinking;
    }
    
    if (settings.cursorStyle && ['line', 'block', 'underline', 'line-thin', 'block-outline', 'underline-thin'].includes(settings.cursorStyle)) {
        validated.cursorStyle = settings.cursorStyle;
    }
    
    // Render whitespace
    if (settings.renderWhitespace && ['none', 'boundary', 'selection', 'trailing', 'all'].includes(settings.renderWhitespace)) {
        validated.renderWhitespace = settings.renderWhitespace;
    }
    
    // Auto indent
    if (settings.autoIndent && ['none', 'keep', 'brackets', 'advanced', 'full'].includes(settings.autoIndent)) {
        validated.autoIndent = settings.autoIndent;
    }
    
    // Match brackets
    if (settings.matchBrackets && ['never', 'near', 'always'].includes(settings.matchBrackets)) {
        validated.matchBrackets = settings.matchBrackets;
    }
    
    // Show folding controls
    if (settings.showFoldingControls && ['never', 'mouseover', 'always'].includes(settings.showFoldingControls)) {
        validated.showFoldingControls = settings.showFoldingControls;
    }
    
    // Word based suggestions
    if (settings.wordBasedSuggestions && ['off', 'currentDocument', 'matchingDocuments', 'allDocuments'].includes(settings.wordBasedSuggestions)) {
        validated.wordBasedSuggestions = settings.wordBasedSuggestions;
    }
    
    // Accept suggestion on enter
    if (settings.acceptSuggestionOnEnter && ['on', 'off', 'smart'].includes(settings.acceptSuggestionOnEnter)) {
        validated.acceptSuggestionOnEnter = settings.acceptSuggestionOnEnter;
    }
    
    // Rulers (array of numbers)
    if (settings.rulers && Array.isArray(settings.rulers)) {
        validated.rulers = settings.rulers.filter(r => typeof r === 'number' && r > 0 && r < 500);
    }
    
    return validated;
}

// Load settings on startup
loadMonacoSettings();

// Export the functions
export { 
    getMonacoSettings, 
    updateMonacoSettings 
};
