import qoomEvent from "../../../utils/qoomEvent.js"

class VersionHistoryModal {
    constructor() {
        this.modal = null;
        this.currentFilePath = null;
        this.versions = [];
        this.selectedVersion = null;
        this.previewMode = 'diff'; // 'diff' or 'full'
        
        this.bindEvents();
    }

    async initialize() {
        this.modal = document.getElementById('versionHistoryModal');    }
    
    
    /**
     * Bind event listeners for modal interactions
     */
    bindEvents() {
        // Wait for modal to be available
        const checkModal = () => {
            if (!this.modal) {
                setTimeout(checkModal, 100);
                return;
            }
            
            // Close modal events
            const closeBtn = document.getElementById('modalCloseBtn');
            const cancelBtn = document.getElementById('cancelBtn');
            const overlay = this.modal.querySelector('.modal-overlay');
            
            closeBtn?.addEventListener('click', () => this.closeModal());
            cancelBtn?.addEventListener('click', () => this.closeModal());
            overlay?.addEventListener('click', () => this.closeModal());
            
            // Rollback button
            const rollbackBtn = document.getElementById('rollbackBtn');
            rollbackBtn?.addEventListener('click', () => this.performRollback());
            
            // Retry button
            const retryBtn = document.getElementById('retryBtn');
            retryBtn?.addEventListener('click', () => this.loadVersionHistory());
            
            // Preview mode buttons
            const diffBtn = document.getElementById('diffBtn');
            const fullBtn = document.getElementById('fullBtn');
            
            diffBtn?.addEventListener('click', () => this.setPreviewMode('diff'));
            fullBtn?.addEventListener('click', () => this.setPreviewMode('full'));
            
            // Keyboard events
            document.addEventListener('keydown', (e) => {
                if (this.modal && this.modal.classList.contains('show')) {
                    if (e.key === 'Escape') {
                        this.closeModal();
                    }
                }
            });
        };
        
        checkModal();
    }
    
    /**
     * Open the modal for a specific file
     * @param {string} filePath - The file path to show history for
     */
    async openModal(filePath) {
        if (!this.modal) {
            console.error('Modal not initialized');
            return;
        }
        
        this.currentFilePath = filePath;
        this.selectedVersion = null;
        
        // Update file path display
        const filePathElement = document.getElementById('modalFilePath');
        if (filePathElement) {
            filePathElement.textContent = filePath;
        }
        
        // Show modal
        this.modal.classList.add('show');
        
        // Load version history
        await this.loadVersionHistory();
    }
    
    /**
     * Close the modal
     */
    closeModal() {
        if (this.modal) {
            this.modal.classList.remove('show');
        }
        this.currentFilePath = null;
        this.selectedVersion = null;
        this.versions = [];
    }
    
    /**
     * Load version history for the current file
     */
    async loadVersionHistory() {
        if (!this.currentFilePath) return;
        
        this.showLoadingState();
        
        try {
            const response = await fetch(`/versions/history/${this.currentFilePath}`);
            const result = await response.json();
            
            if (result.success) {
                this.versions = result.data || [];
                this.displayVersions();
            } else {
                this.showErrorState(result.message || 'Failed to load version history');
            }
        } catch (error) {
            console.error('Error loading version history:', error);
            this.showErrorState('Network error while loading versions');
        }
    }
    
    /**
     * Show loading state in version list
     */
    showLoadingState() {
        const loading = document.getElementById('versionListLoading');
        const error = document.getElementById('versionListError');
        const empty = document.getElementById('versionListEmpty');
        const list = document.getElementById('versionList');
        
        if (loading) loading.style.display = 'flex';
        if (error) error.style.display = 'none';
        if (empty) empty.style.display = 'none';
        if (list) list.style.display = 'none';
    }
    
    /**
     * Show error state in version list
     * @param {string} message - Error message to display
     */
    showErrorState(message) {
        const loading = document.getElementById('versionListLoading');
        const error = document.getElementById('versionListError');
        const errorMessage = document.getElementById('errorMessage');
        const empty = document.getElementById('versionListEmpty');
        const list = document.getElementById('versionList');
        
        if (loading) loading.style.display = 'none';
        if (error) error.style.display = 'flex';
        if (errorMessage) errorMessage.textContent = message;
        if (empty) empty.style.display = 'none';
        if (list) list.style.display = 'none';
    }
    
    /**
     * Display the list of versions
     */
    displayVersions() {
        const loading = document.getElementById('versionListLoading');
        const error = document.getElementById('versionListError');
        const empty = document.getElementById('versionListEmpty');
        const list = document.getElementById('versionList');
        const versionCount = document.getElementById('versionCount');
        
        // Hide loading and error states
        if (loading) loading.style.display = 'none';
        if (error) error.style.display = 'none';
        
        // Update version count
        if (versionCount) {
            versionCount.textContent = this.versions.length;
        }
        
        if (this.versions.length === 0) {
            if (empty) empty.style.display = 'flex';
            if (list) list.style.display = 'none';
            return;
        }
        
        // Show version list
        if (empty) empty.style.display = 'none';
        if (list) {
            list.style.display = 'block';
            list.innerHTML = '';
            
            // Create version items
            this.versions.forEach(version => {
                const item = this.createVersionItem(version);
                list.appendChild(item);
            });
        }
    }
    
    /**
     * Create a version item element
     * @param {object} version - Version data
     * @returns {HTMLElement} Version item element
     */
    createVersionItem(version) {
        const template = document.getElementById('versionItemTemplate');
        if (!template) {
            console.error('Version item template not found');
            return document.createElement('div');
        }
        
        const item = template.content.cloneNode(true);
        const itemElement = item.querySelector('.version-item');
        
        // Set data attributes
        itemElement.dataset.timestamp = version.timestamp;
        itemElement.dataset.filename = version.filename;
        
        // Set content
        const dateElement = item.querySelector('.version-date');
        const sizeElement = item.querySelector('.version-size');
        const ageElement = item.querySelector('.version-age');
        
        if (dateElement) {
            dateElement.textContent = this.formatDate(version.date);
        }
        
        if (sizeElement) {
            sizeElement.textContent = this.formatFileSize(version.size);
        }
        
        if (ageElement) {
            ageElement.textContent = this.formatTimeAgo(version.date);
        }
        
        // Bind events
        itemElement.addEventListener('click', () => this.selectVersion(version));
        
        const previewBtn = item.querySelector('.version-preview-btn');
        const rollbackBtn = item.querySelector('.version-rollback-btn');
        
        previewBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectVersion(version);
            this.loadVersionPreview(version);
        });
        
        rollbackBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectVersion(version);
            this.performRollback();
        });
        
        return item;
    }
    
    /**
     * Select a version
     * @param {object} version - Version to select
     */
    selectVersion(version) {
        this.selectedVersion = version;
        
        // Update UI selection
        const versionItems = document.querySelectorAll('.version-item');
        versionItems.forEach(item => {
            if (item.dataset.timestamp === version.timestamp.toString()) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
        
        // Update footer info
        this.updateSelectedVersionInfo();
        
        // Enable rollback button
        const rollbackBtn = document.getElementById('rollbackBtn');
        if (rollbackBtn) {
            rollbackBtn.disabled = false;
        }
        
        // Load preview
        this.loadVersionPreview(version);
    }
    
    /**
     * Update selected version info in footer
     */
    updateSelectedVersionInfo() {
        const selectedVersionInfo = document.getElementById('selectedVersionInfo');
        const selectedVersionDate = document.getElementById('selectedVersionDate');
        const selectedVersionSize = document.getElementById('selectedVersionSize');
        
        if (this.selectedVersion && selectedVersionInfo) {
            selectedVersionInfo.style.display = 'block';
            
            if (selectedVersionDate) {
                selectedVersionDate.textContent = this.formatDate(this.selectedVersion.date);
            }
            
            if (selectedVersionSize) {
                selectedVersionSize.textContent = this.formatFileSize(this.selectedVersion.size);
            }
        } else if (selectedVersionInfo) {
            selectedVersionInfo.style.display = 'none';
        }
    }
    
    /**
     * Load preview for a version
     * @param {object} version - Version to preview
     */
    async loadVersionPreview(version) {
        const loading = document.getElementById('versionPreviewLoading');
        const empty = document.getElementById('versionPreviewEmpty');
        const content = document.getElementById('versionPreviewContent');
        const error = document.getElementById('versionPreviewError');
        const previewCode = document.getElementById('previewCode');
        
        // Show loading state
        if (loading) loading.style.display = 'flex';
        if (empty) empty.style.display = 'none';
        if (content) content.style.display = 'none';
        if (error) error.style.display = 'none';
        
        try {
            const response = await fetch(`/versions/content/${this.currentFilePath}/${version.timestamp}`);
            const result = await response.json();
            
            if (result.success && previewCode) {
                let displayContent = result.data.content;
                
                // Handle diff vs full mode
                if (this.previewMode === 'diff') {
                    displayContent = await this.generateDiffContent(result.data.content);
                }
                
                previewCode.textContent = displayContent;
                
                // Show content
                if (loading) loading.style.display = 'none';
                if (content) content.style.display = 'block';
            } else {
                this.showPreviewError(result.message || 'Failed to load version content');
            }
        } catch (err) {
            console.error('Error loading version preview:', err);
            this.showPreviewError('Network error while loading preview');
        }
    }

    /**
     * Generate diff content comparing version with current file
     * @param {string} versionContent - Content of the selected version
     * @returns {Promise<string>} Diff content
     */
    async generateDiffContent(versionContent) {
        try {
            // Get current file content
            const currentResponse = await fetch(`/view/${this.currentFilePath}`);
            if (!currentResponse.ok) {
                return `Error: Cannot load current file for diff\n\n--- Version Content ---\n${versionContent}`;
            }
            
            const currentContent = await currentResponse.text();
            
            // Simple line-by-line diff
            const currentLines = currentContent.split('\n');
            const versionLines = versionContent.split('\n');
            
            const diffLines = [];
            const maxLines = Math.max(currentLines.length, versionLines.length);
            
            diffLines.push('--- Current File ---');
            diffLines.push('+++ Selected Version +++');
            diffLines.push('');
            
            for (let i = 0; i < maxLines; i++) {
                const currentLine = currentLines[i] || '';
                const versionLine = versionLines[i] || '';
                
                if (currentLine !== versionLine) {
                    if (currentLines[i] !== undefined) {
                        diffLines.push(`- ${currentLine}`);
                    }
                    if (versionLines[i] !== undefined) {
                        diffLines.push(`+ ${versionLine}`);
                    }
                } else {
                    diffLines.push(`  ${currentLine}`);
                }
            }
            
            return diffLines.join('\n');
            
        } catch (error) {
            console.error('Error generating diff:', error);
            return `Error generating diff: ${error.message}\n\n--- Version Content ---\n${versionContent}`;
        }
    }
    
    /**
     * Show preview error state
     * @param {string} message - Error message
     */
    showPreviewError(message) {
        const loading = document.getElementById('versionPreviewLoading');
        const empty = document.getElementById('versionPreviewEmpty');
        const content = document.getElementById('versionPreviewContent');
        const error = document.getElementById('versionPreviewError');
        const previewErrorMessage = document.getElementById('previewErrorMessage');
        
        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'none';
        if (content) content.style.display = 'none';
        if (error) error.style.display = 'flex';
        if (previewErrorMessage) previewErrorMessage.textContent = message;
    }
    
    /**
     * Set preview mode (diff or full)
     * @param {string} mode - Preview mode
     */
    setPreviewMode(mode) {
        this.previewMode = mode;
        
        const diffBtn = document.getElementById('diffBtn');
        const fullBtn = document.getElementById('fullBtn');
        
        if (diffBtn && fullBtn) {
            diffBtn.classList.toggle('active', mode === 'diff');
            fullBtn.classList.toggle('active', mode === 'full');
        }
        
        // Reload preview with new mode
        if (this.selectedVersion) {
            this.loadVersionPreview(this.selectedVersion);
        }
    }
    
    /**
     * Perform rollback operation
     */
    async performRollback() {
        if (!this.selectedVersion || !this.currentFilePath) {
            console.error('No version selected for rollback');
            return;
        }
        
        const rollbackBtn = document.getElementById('rollbackBtn');
        const originalText = rollbackBtn?.textContent || '';
        
        try {
            // Update button state
            if (rollbackBtn) {
                rollbackBtn.disabled = true;
                rollbackBtn.textContent = 'Rolling back...';
            }
            
            const response = await fetch(`/versions/rollback/${this.currentFilePath}/${this.selectedVersion.timestamp}`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Notify success
                this.showNotification('File rolled back successfully!', 'success');
                
                // Close modal
                this.closeModal();
                
                
                qoomEvent.emit('refreshCurrentFile');
                
                
            } else {
                this.showNotification(result.message || 'Failed to rollback file', 'error');
            }
            
        } catch (error) {
            console.error('Error performing rollback:', error);
            this.showNotification('Network error during rollback', 'error');
        } finally {
            // Restore button state
            if (rollbackBtn) {
                rollbackBtn.disabled = false;
                rollbackBtn.textContent = originalText;
            }
        }
    }
    
    /**
     * Show notification to user
     * @param {string} message - Notification message
     * @param {string} type - Notification type (success, error, info)
     */
    showNotification(message, type = 'info') {
        // This could integrate with existing notification system
        // For now, use a simple alert
        if (type === 'error') {
            alert('Error: ' + message);
        } else {
            alert(message);
        }
        
        console.log(`Notification (${type}):`, message);
    }
    
    /**
     * Format date for display
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    }
    
    /**
     * Format file size for display
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    /**
     * Format time ago for display
     * @param {string} dateString - ISO date string
     * @returns {string} Time ago string
     */
    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 30) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }
}

export default VersionHistoryModal