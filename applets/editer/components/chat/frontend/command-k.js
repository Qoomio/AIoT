/**
 * Command+K AI Assistant JavaScript
 * 
 * Provides Cursor-like Command+K functionality for inline code assistance
 */

'use strict';

class CommandKAssistant {
    #editorPane;
    constructor(editorPane) {
        this.overlay = null;
        this.modal = null;
        this.input = null;
        this.isInitialized = false;
        this.currentEditor = null;
        this.currentSelection = null;
        this.currentContext = null;
        this.lastResponse = null;
        this.isProcessing = false;
        this.#editorPane = editorPane;
        this.init();
    }

    /**
     * Initialize the Command+K assistant
     */
    async init() {
        if (this.isInitialized) return;

        await this.loadCSS();
        await this.injectHTML();
        this.setupElements();
        this.setupEventListeners();
        this.isInitialized = true;
        
        console.log('Command+K Assistant initialized');
    }

    /**
     * Load CSS for Command+K modal
     */
    async loadCSS() {
        // Check if CSS is already loaded
        if (document.querySelector('link[href*="command-k.css"]')) {
            return;
        }
        
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/chat/frontend/command-k.css';
        
        document.head.appendChild(link);
        
        // Wait for CSS to load
        return new Promise((resolve) => {
            link.onload = resolve;
            link.onerror = resolve; // Continue even if CSS fails to load
        });
    }

    /**
     * Inject HTML template into the document
     */
    async injectHTML() {
        try {
            const response = await fetch('/view/applets/editer/components/chat/frontend/command-k.html');
            const html = await response.text();
            
            // Create container and inject HTML
            const container = document.createElement('div');
            container.innerHTML = html;
            document.body.appendChild(container.firstElementChild);
            
        } catch (error) {
            console.error('Failed to load Command+K HTML template:', error);
            // Fallback: create minimal HTML structure
            this.createFallbackHTML();
        }
    }

    /**
     * Create fallback HTML if template loading fails
     */
    createFallbackHTML() {
        const overlay = document.createElement('div');
        overlay.id = 'commandKOverlay';
        overlay.className = 'command-k-overlay';
        overlay.innerHTML = `
            <div class="command-k-modal" id="commandKModal">
                <div class="command-k-header">
                    <h3 class="command-k-title">🤖 Qoom AI Assistant</h3>
                    <button class="command-k-close" id="commandKClose">×</button>
                </div>
                <div class="command-k-content">
                    <div class="command-k-input-section">
                        <div class="command-k-context-info" id="commandKContextInfo">
                            <span>📄</span>
                            <span id="commandKContextText">No file selected</span>
                        </div>
                        <textarea class="command-k-input" id="commandKInput" 
                                placeholder="What would you like me to help you with?"></textarea>
                    </div>
                    <div class="command-k-actions">
                        <button class="command-k-btn command-k-btn-secondary" id="commandKCancel">Cancel</button>
                        <button class="command-k-btn command-k-btn-primary" id="commandKSend" disabled>Generate</button>
                    </div>
                    <div class="command-k-response-section" id="commandKResponseSection" style="display: none;">
                        <div class="command-k-response-content" id="commandKResponseContent"></div>
                    </div>
                    <div class="command-k-apply-section" id="commandKApplySection" style="display: none;">
                        <div class="command-k-apply-actions">
                            <button class="command-k-btn command-k-btn-apply" id="commandKApply">Apply</button>
                            <button class="command-k-btn command-k-btn-reject" id="commandKReject">Reject</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    /**
     * Setup DOM element references
     */
    setupElements() {
        this.overlay = document.getElementById('commandKOverlay');
        this.modal = document.getElementById('commandKModal');
        this.input = document.getElementById('commandKInput');
        this.contextInfo = document.getElementById('commandKContextInfo');
        this.contextText = document.getElementById('commandKContextText');
        this.lineInfo = document.getElementById('commandKLineInfo');
        this.sendBtn = document.getElementById('commandKSend');
        this.cancelBtn = document.getElementById('commandKCancel');
        this.closeBtn = document.getElementById('commandKClose');
        this.responseSection = document.getElementById('commandKResponseSection');
        this.responseContent = document.getElementById('commandKResponseContent');
        this.applySection = document.getElementById('commandKApplySection');
        this.applyBtn = document.getElementById('commandKApply');
        this.rejectBtn = document.getElementById('commandKReject');
        this.askMoreBtn = document.getElementById('commandKAskMore');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Close modal events
        this.closeBtn?.addEventListener('click', () => this.hide());
        this.cancelBtn?.addEventListener('click', () => this.hide());
        this.overlay?.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });

        // Input events
        this.input?.addEventListener('input', () => this.handleInputChange());
        this.input?.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Action buttons
        this.sendBtn?.addEventListener('click', () => this.handleSend());
        this.applyBtn?.addEventListener('click', () => this.handleApply());
        this.rejectBtn?.addEventListener('click', () => this.handleReject());
        this.askMoreBtn?.addEventListener('click', () => this.handleAskMore());

        // Global keyboard shortcut
        document.addEventListener('keydown', (e) => this.handleGlobalKeyDown(e));

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    /**
     * Handle global keyboard shortcuts
     */
    handleGlobalKeyDown(e) {
        // Command+K or Ctrl+K
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            this.show();
        }
    }

    /**
     * Handle input changes
     */
    handleInputChange() {
        const hasText = this.input?.value.trim().length > 0;
        if (this.sendBtn) {
            this.sendBtn.disabled = !hasText || this.isProcessing;
        }
    }

    /**
     * Handle keydown in input
     */
    handleKeyDown(e) {
        // Send on Cmd+Enter or Ctrl+Enter
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (!this.sendBtn?.disabled) {
                this.handleSend();
            }
        }
    }

    /**
     * Show the Command+K modal
     */
    show() {
        if (!this.overlay) return;

        // Get current editor context
        this.updateContext();
        
        // Show modal
        this.overlay.classList.add('active');
        
        // Focus input
        setTimeout(() => {
            this.input?.focus();
        }, 100);

        // Reset state
        this.resetModal();
    }

    /**
     * Hide the Command+K modal
     */
    hide() {
        if (!this.overlay) return;
        
        this.overlay.classList.remove('active');
        this.resetModal();
    }

    /**
     * Check if modal is visible
     */
    isVisible() {
        return this.overlay?.classList.contains('active') || false;
    }

    /**
     * Reset modal to initial state
     */
    resetModal() {
        if (this.input) this.input.value = '';
        if (this.responseSection) this.responseSection.style.display = 'none';
        if (this.applySection) this.applySection.style.display = 'none';
        if (this.responseContent) this.responseContent.innerHTML = '';
        
        this.lastResponse = null;
        this.isProcessing = false;
        this.handleInputChange();
    }

    /**
     * Update context from current editor
     */
    updateContext() {
        this.currentEditor = this.getCurrentEditor();
        this.currentSelection = null;
        this.currentContext = null;

        if (!this.currentEditor) {
            this.updateContextDisplay('No file selected', null);
            return;
        }

        // Get current file info
        const currentTab = this.getCurrentTab();
        const fileName = currentTab?.fileName || 'Unknown file';
        
        // Get selection or current line
        const selection = this.currentEditor.getSelection();
        const position = this.currentEditor.getPosition();
        
        if (selection && !selection.isEmpty()) {
            // Has selection
            const startLine = selection.startLineNumber;
            const endLine = selection.endLineNumber;
            const selectedText = this.currentEditor.getModel().getValueInRange(selection);
            
            this.currentSelection = {
                range: selection,
                text: selectedText
            };
            
            this.currentContext = {
                fileName,
                hasSelection: true,
                startLine,
                endLine,
                selectedText,
                fullContent: this.currentEditor.getValue()
            };

            const lineInfo = startLine === endLine ? 
                `Line ${startLine}` : 
                `Lines ${startLine}-${endLine}`;
                
            this.updateContextDisplay(fileName, lineInfo);
            
        } else if (position) {
            // Current line only
            const lineNumber = position.lineNumber;
            const lineContent = this.currentEditor.getModel().getLineContent(lineNumber);
            
            this.currentContext = {
                fileName,
                hasSelection: false,
                currentLine: lineNumber,
                lineContent,
                fullContent: this.currentEditor.getValue()
            };
            
            this.updateContextDisplay(fileName, `Line ${lineNumber}`);
        } else {
            // No specific context
            this.currentContext = {
                fileName,
                hasSelection: false,
                fullContent: this.currentEditor.getValue()
            };
            
            this.updateContextDisplay(fileName, null);
        }
    }

    /**
     * Update context display in UI
     */
    updateContextDisplay(fileName, lineInfo) {
        if (this.contextText) {
            this.contextText.textContent = fileName;
        }
        
        if (this.lineInfo) {
            if (lineInfo) {
                this.lineInfo.textContent = lineInfo;
                this.lineInfo.style.display = 'inline';
            } else {
                this.lineInfo.style.display = 'none';
            }
        }
    }

    /**
     * Get current Monaco editor instance
     */
    getCurrentEditor() {
        return this.#editorPane.editor;
    }

    /**
     * Get current tab information
     */
    getCurrentTab() {
        return this.#editorPane.getActiveTab();
    }

    /**
     * Handle send button click
     */
    async handleSend() {
        const prompt = this.input?.value.trim();
        if (!prompt || this.isProcessing) return;

        this.isProcessing = true;
        this.updateSendButton(true);

        try {
            // Show response section with loading
            this.showResponseSection();
            this.showLoading();

            // Prepare context for AI
            const contextMessage = this.prepareContextMessage(prompt);

            // Send to AI
            const response = await this.sendToAI(contextMessage);
            
            if (response.success) {
                this.displayResponse(response.message);
                this.lastResponse = response.message;
                
                // Check if response contains code that can be applied
                if (this.containsApplicableCode(response.message)) {
                    this.showApplySection();
                }
            } else {
                this.displayError(response.error || 'Failed to get AI response');
            }

        } catch (error) {
            console.error('Command+K send error:', error);
            this.displayError('An error occurred while processing your request');
        } finally {
            this.isProcessing = false;
            this.updateSendButton(false);
        }
    }

    /**
     * Prepare context message for AI
     */
    prepareContextMessage(userPrompt) {
        if (!this.currentContext) {
            return userPrompt;
        }

        let contextMessage = `File: ${this.currentContext.fileName}\n\n`;

        if (this.currentContext.hasSelection) {
            contextMessage += `Selected code (lines ${this.currentContext.startLine}-${this.currentContext.endLine}):\n`;
            contextMessage += '```\n';
            contextMessage += this.currentContext.selectedText;
            contextMessage += '\n```\n\n';
            
            contextMessage += `Full file context:\n`;
            contextMessage += '```\n';
            contextMessage += this.currentContext.fullContent;
            contextMessage += '\n```\n\n';
        } else if (this.currentContext.currentLine) {
            contextMessage += `Current line ${this.currentContext.currentLine}: ${this.currentContext.lineContent}\n\n`;
            contextMessage += `Full file context:\n`;
            contextMessage += '```\n';
            contextMessage += this.currentContext.fullContent;
            contextMessage += '\n```\n\n';
        } else {
            contextMessage += `File content:\n`;
            contextMessage += '```\n';
            contextMessage += this.currentContext.fullContent;
            contextMessage += '\n```\n\n';
        }

        contextMessage += `User request: ${userPrompt}`;
        
        return contextMessage;
    }

    /**
     * Send message to AI service
     */
    async sendToAI(message) {
        try {
            const response = await fetch('/chat/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    agent: 'qoom', // Use default Qoom agent
                    agentInfo: { type: 'qoom', token: null },
                    fileContext: this.currentContext ? {
                        path: this.currentContext.fileName,
                        hasContext: true
                    } : null,
                    isStarterMode: false
                })
            });

            const data = await response.json();
            return data;

        } catch (error) {
            console.error('AI API error:', error);
            return {
                success: false,
                error: 'Failed to connect to AI service'
            };
        }
    }

    /**
     * Show response section
     */
    showResponseSection() {
        if (this.responseSection) {
            this.responseSection.style.display = 'flex';
        }
    }

    /**
     * Show loading state
     */
    showLoading() {
        if (this.responseContent) {
            this.responseContent.innerHTML = `
                <div class="command-k-loading-container">
                    <div class="command-k-loading"></div>
                    <span>Thinking...</span>
                </div>
            `;
        }
    }

    /**
     * Display AI response
     */
    displayResponse(response) {
        if (!this.responseContent) return;

        // Render markdown-like response
        const renderedContent = this.renderResponse(response);
        this.responseContent.innerHTML = renderedContent;
    }

    /**
     * Display error message
     */
    displayError(error) {
        if (!this.responseContent) return;

        this.responseContent.innerHTML = `
            <div class="command-k-error">
                <span class="error-icon">⚠️</span>
                <span>${error}</span>
            </div>
        `;
    }

    /**
     * Render AI response with basic markdown support
     */
    renderResponse(content) {
        // Basic code block rendering
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let processedContent = content;
        let match;
        
        while ((match = codeBlockRegex.exec(content)) !== null) {
            const language = match[1] || 'text';
            const code = match[2].trim();
            const fullMatch = match[0];
            
            const styledCodeBlock = `
                <pre class="code-block" data-lang="${language}">
                    <code class="language-${language}">${this.escapeHtml(code)}</code>
                </pre>
            `;
            
            processedContent = processedContent.replace(fullMatch, styledCodeBlock);
        }
        
        // Basic line breaks
        processedContent = processedContent.replace(/\n/g, '<br>');
        
        return processedContent;
    }

    /**
     * Escape HTML characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Check if response contains code that can be applied
     */
    containsApplicableCode(response) {
        // Check for code blocks
        return /```[\s\S]*?```/g.test(response);
    }

    /**
     * Show apply section
     */
    showApplySection() {
        if (this.applySection) {
            this.applySection.classList.add('show');
            this.generateDiffPreview();
        }
    }

    /**
     * Generate diff preview
     */
    generateDiffPreview() {
        if (!this.lastResponse || !this.currentEditor) return;

        const code = this.extractCodeFromResponse(this.lastResponse);
        if (!code) return;

        let oldCode = '';
        if (this.currentSelection && this.currentSelection.range) {
            // Replace selected text
            oldCode = this.currentSelection.text;
        } else {
            // Insert at current position - show context
            const position = this.currentEditor.getPosition();
            if (position) {
                const lineContent = this.currentEditor.getModel().getLineContent(position.lineNumber);
                oldCode = `[Insert at line ${position.lineNumber}] ${lineContent}`;
            }
        }

        // Simple diff display
        const diffPreview = document.getElementById('commandKDiffPreview');
        if (diffPreview) {
            const diffHtml = this.createSimpleDiff(oldCode, code);
            diffPreview.innerHTML = diffHtml;
        }
    }

    /**
     * Create simple diff visualization
     */
    createSimpleDiff(oldCode, newCode) {
        if (!oldCode.trim()) {
            // New insertion
            return `<div class="command-k-diff-line added">+ ${this.escapeHtml(newCode)}</div>`;
        }

        // Simple replacement visualization
        const oldLines = oldCode.split('\n');
        const newLines = newCode.split('\n');

        let diffHtml = '';
        
        // Show removed lines
        oldLines.forEach(line => {
            diffHtml += `<div class="command-k-diff-line removed">- ${this.escapeHtml(line)}</div>`;
        });

        // Show added lines
        newLines.forEach(line => {
            diffHtml += `<div class="command-k-diff-line added">+ ${this.escapeHtml(line)}</div>`;
        });

        return diffHtml;
    }

    /**
     * Hide apply section
     */
    hideApplySection() {
        if (this.applySection) {
            this.applySection.classList.remove('show');
        }
    }

    /**
     * Update send button state
     */
    updateSendButton(loading) {
        if (!this.sendBtn) return;

        if (loading) {
            this.sendBtn.disabled = true;
            this.sendBtn.innerHTML = `
                <div class="command-k-loading"></div>
                Processing...
            `;
        } else {
            this.sendBtn.disabled = this.input?.value.trim().length === 0;
            this.sendBtn.innerHTML = `
                <span class="btn-icon">✨</span>
                Generate
            `;
        }
    }

    /**
     * Handle apply button click
     */
    async handleApply() {
        if (!this.lastResponse || !this.currentEditor) return;

        try {
            // Extract code from response
            const code = this.extractCodeFromResponse(this.lastResponse);
            if (!code) {
                alert('No applicable code found in the response');
                return;
            }

            // Apply to editor
            await this.applyCodeToEditor(code);
            
            // Close modal
            this.hide();
            
            // Show success message
            this.showNotification('Code applied successfully!', 'success');

        } catch (error) {
            console.error('Error applying code:', error);
            this.showNotification('Failed to apply code', 'error');
        }
    }

    /**
     * Handle reject button click
     */
    handleReject() {
        this.hideApplySection();
        this.showNotification('Changes rejected', 'info');
    }

    /**
     * Handle ask more button click
     */
    handleAskMore() {
        // Reset to input mode for follow-up questions
        this.hideApplySection();
        if (this.responseSection) {
            this.responseSection.style.display = 'none';
        }
        this.input?.focus();
    }

    /**
     * Extract code from AI response
     */
    extractCodeFromResponse(response) {
        const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
        const matches = [...response.matchAll(codeBlockRegex)];
        
        if (matches.length === 0) return null;
        
        // For now, take the first code block
        // In a more sophisticated implementation, we could let user choose
        return matches[0][1].trim();
    }

    /**
     * Apply code to the current editor
     */
    async applyCodeToEditor(code) {
        if (!this.currentEditor) return;

        if (this.currentSelection && this.currentSelection.range) {
            // Replace selected text
            this.currentEditor.executeEdits('command-k-apply', [{
                range: this.currentSelection.range,
                text: code
            }]);
        } else {
            // Insert at current position
            const position = this.currentEditor.getPosition();
            if (position) {
                this.currentEditor.executeEdits('command-k-apply', [{
                    range: new this.currentEditor.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                    text: code
                }]);
            }
        }

        // Trigger formatting if available
        try {
            await this.currentEditor.getAction('editor.action.formatDocument')?.run();
        } catch (error) {
            // Formatting failed, ignore
        }
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `command-k-notification notification-${type}`;
        notification.textContent = message;
        
        // Style notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#007acc',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '4px',
            zIndex: '10001',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            animation: 'slideInRight 0.3s ease-out'
        });
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize Command+K assistant when document is ready
let commandKInstance = null;

function initializeCommandK(editorPane) {
    if (!commandKInstance) {
        commandKInstance = new CommandKAssistant(editorPane);
    }
    return commandKInstance;
}

function show() {
    commandKInstance.show();
}

function hide() {
    commandKInstance?.hide();
}

function getInstance() {
    return commandKInstance;
}

export {
    initializeCommandK,
    show,
    hide,
    getInstance,    
}

