/**
 * Monaco Settings Modal System
 * 
 * Provides a comprehensive settings interface for Monaco editor configuration
 */
import qoomEvent from "../../../utils/qoomEvent.js"

class MonacoSettings {
    state = null;
    constructor(state) {
        this.state = state;
        this.modal = null;
        this.currentSettings = {};
        this.defaultSettings = {
            theme: "vs-dark",
            fontSize: 14,
            lineNumbers: "on",
            minimap: { enabled: true, scale: 1 },
            wordWrap: "on",
            tabSize: 4,
            insertSpaces: false,
            autoIndent: "advanced",
            scrollBeyondLastLine: false,
            cursorBlinking: "blink",
            cursorStyle: "line",
            renderWhitespace: "selection",
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
    }

    async initialize() {
        this.modal = document.getElementById('monaco-settings-modal');
        await this.loadCurrentSettings();
        this.setupEventListeners();
        this.setupRangeUpdaters();
    }

    async loadCurrentSettings() {
        try {
            const response = await fetch('/edit/_api/monaco/settings');
            const result = await response.json();
            
            if (result.success) {
                this.currentSettings = result.data;
                this.populateForm();
            } else {
                console.error('Failed to load settings:', result.error);
                this.currentSettings = { ...this.defaultSettings };
                this.populateForm();
            }
        } catch (error) {
            console.error('Error loading Monaco settings:', error);
            this.currentSettings = { ...this.defaultSettings };
            this.populateForm();
        }
    }

    populateForm() {
        const form = document.getElementById('monaco-settings-form');
        if (!form) return;

        // Set simple values
        Object.keys(this.currentSettings).forEach(key => {
            if (key === 'minimap' || key === 'rulers') return; // Handle separately
            
            const element = form.querySelector(`[name="${key}"]`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = this.currentSettings[key];
                } else {
                    element.value = this.currentSettings[key];
                }
            }
        });

        // Handle minimap settings
        if (this.currentSettings.minimap) {
            const minimapEnabled = form.querySelector('[name="minimap.enabled"]');
            const minimapScale = form.querySelector('[name="minimap.scale"]');
            
            if (minimapEnabled) {
                minimapEnabled.checked = this.currentSettings.minimap.enabled;
                this.toggleMinimapOptions(this.currentSettings.minimap.enabled);
            }
            if (minimapScale && this.currentSettings.minimap.scale) {
                minimapScale.value = this.currentSettings.minimap.scale;
            }
        }

        // Handle rulers array
        if (this.currentSettings.rulers) {
            const rulersInput = form.querySelector('[name="rulers"]');
            if (rulersInput) {
                rulersInput.value = this.currentSettings.rulers.join(', ');
            }
        }

        // Update range value displays
        this.updateRangeDisplays();
    }

    setupEventListeners() {
        if (!this.modal) return;

        // Close button
        const closeBtn = this.modal.querySelector('#monaco-settings-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Backdrop click
        const backdrop = this.modal.querySelector('.monaco-settings-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => this.close());
        }

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.close();
            }
        });

        // Footer buttons
        const resetBtn = this.modal.querySelector('#monaco-settings-reset');
        const cancelBtn = this.modal.querySelector('#monaco-settings-cancel');
        const saveBtn = this.modal.querySelector('#monaco-settings-save');

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetToDefaults());
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.close());
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }

        // Minimap toggle
        const minimapEnabled = this.modal.querySelector('[name="minimap.enabled"]');
        if (minimapEnabled) {
            minimapEnabled.addEventListener('change', (e) => {
                this.toggleMinimapOptions(e.target.checked);
            });
        }
    }

    setupRangeUpdaters() {
        if (!this.modal) return;

        const rangeInputs = this.modal.querySelectorAll('input[type="range"]');
        rangeInputs.forEach(input => {
            input.addEventListener('input', () => this.updateRangeDisplay(input));
        });
    }

    updateRangeDisplays() {
        if (!this.modal) return;

        const rangeInputs = this.modal.querySelectorAll('input[type="range"]');
        rangeInputs.forEach(input => this.updateRangeDisplay(input));
    }

    updateRangeDisplay(input) {
        const valueSpan = document.getElementById(`${input.id}-value`);
        if (valueSpan) {
            if (input.id === 'fontSize') {
                valueSpan.textContent = `${input.value}px`;
            } else {
                valueSpan.textContent = input.value;
            }
        }
    }

    toggleMinimapOptions(enabled) {
        const minimapOptions = this.modal.querySelector('.minimap-options');
        if (minimapOptions) {
            if (enabled) {
                minimapOptions.classList.add('enabled');
            } else {
                minimapOptions.classList.remove('enabled');
            }
        }
    }

    show() {
        if (!this.modal || this.modal.classList.contains('show')) return;
        this.modal.classList.add('show');
        // Focus management
        const firstInput = this.modal.querySelector('select, input');
        if (firstInput) {
            firstInput.focus();
        }
    }

    close() {
        if (this.modal) {
            this.modal.classList.remove('show');
        }
    }

    resetToDefaults() {
        if (confirm('Are you sure you want to reset all settings to defaults? This action cannot be undone.')) {
            this.currentSettings = { ...this.defaultSettings };
            this.populateForm();
        }
    }

    collectFormData() {
        const form = document.getElementById('monaco-settings-form');
        if (!form) return {};

        const formData = new FormData(form);
        const settings = {};

        // Handle regular form fields
        for (const [key, value] of formData.entries()) {
            if (key.startsWith('minimap.')) {
                // Handle nested minimap settings
                if (!settings.minimap) settings.minimap = {};
                const minimapKey = key.split('.')[1];
                
                if (minimapKey === 'enabled') {
                    settings.minimap.enabled = true; // Checkbox is present means true
                } else if (minimapKey === 'scale') {
                    settings.minimap.scale = parseInt(value);
                }
            } else if (key === 'rulers') {
                // Handle rulers array
                settings.rulers = value.split(',')
                    .map(r => parseInt(r.trim()))
                    .filter(r => !isNaN(r) && r > 0);
            } else {
                // Handle other fields
                const element = form.querySelector(`[name="${key}"]`);
                if (element) {
                    if (element.type === 'number' || element.type === 'range') {
                        settings[key] = parseInt(value);
                    } else if (element.type === 'checkbox') {
                        settings[key] = true; // Checkbox present means true
                    } else {
                        settings[key] = value;
                    }
                }
            }
        }

        // Handle unchecked checkboxes
        const checkboxes = form.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                if (checkbox.name.startsWith('minimap.')) {
                    if (!settings.minimap) settings.minimap = {};
                    const minimapKey = checkbox.name.split('.')[1];
                    settings.minimap[minimapKey] = false;
                } else {
                    settings[checkbox.name] = false;
                }
            }
        });

        return settings;
    }

    async saveSettings() {
        try {
            const settings = this.collectFormData();
            
            const response = await fetch('/edit/_api/monaco/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });

            const result = await response.json();

            if (result.success) {
                this.currentSettings = result.data;
                
                // Apply settings to all Monaco editors
                this.state.layout.panes.forEach((pane) => pane.updatePaneOptions(this.currentSettings));
                
                // Close modal after short delay
                setTimeout(() => this.close(), 1000);
            }
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }
}

async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="monaco-settings.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/monaco-settings/frontend/monaco-settings.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load Monaco Settings CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
    try {
        const htmlResponse = await fetch('/view/applets/editer/components/monaco-settings/frontend/monaco-settings.html');
        const html = await htmlResponse.text();
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', html);
        // this.modal = document.getElementById('monaco-settings-modal');
        
    } catch (error) {
        console.error('Failed to load monaco settings template:', error);
    }
}

async function initialize(state) {
    await injectCSS();
    await injectHTML();

    const monacoSettings = new MonacoSettings(state);
    monacoSettings.initialize();
    qoomEvent.on('showMonacoSettings', () => {
        monacoSettings.show();
    });
    console.log('Monaco settings initialized');
}

export {
    initialize
}