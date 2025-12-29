/**
 * Auto-refresh utility for renderer templates
 * Connects to the file watcher and refreshes content when files change
 */
let autoRefresh;
class AutoRefresh {
    constructor(filePath, onRefresh) {
        this.filePath = this.normalizePath(filePath);
        this.onRefresh = onRefresh || (() => window.location.reload());
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        
        console.log('[AUTO-REFRESH] Watching for changes to:', this.filePath);
        this.connect();
    }
    
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/watcher/_sync`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('[AUTO-REFRESH] Connected to file watcher');
                this.reconnectAttempts = 0;
                
                // Request to watch the current file (all events will be sent)
                this.ws.send(JSON.stringify({
                    type: 'watch_files',
                    files: [this.filePath]
                }));
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('[AUTO-REFRESH] Error parsing message:', error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('[AUTO-REFRESH] WebSocket connection closed');
                this.attemptReconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('[AUTO-REFRESH] WebSocket error:', error);
            };
            
        } catch (error) {
            console.error('[AUTO-REFRESH] Failed to create WebSocket:', error);
            this.attemptReconnect();
        }
    }
    
    handleMessage(message) {
        switch (message.type) {
            case 'connection_established':
                console.log('[AUTO-REFRESH] Connection established:', message.clientId);
                break;
                
            case 'watch_files_confirmed':
                console.log('[AUTO-REFRESH] Now receiving all file events:', message.message);
                break;
                
            case 'file_changed':
                if (this.isFileMatch(message.filePath)) {
                    console.log('[AUTO-REFRESH] Watched file changed, refreshing content:', message.filePath);
                    this.onRefresh(message);
                } else {
                    console.log('[AUTO-REFRESH] File changed but not watched:', message.filePath);
                }
                break;
                
            case 'file_deleted':
                if (this.isFileMatch(message.filePath)) {
                    console.log('[AUTO-REFRESH] Watched file deleted:', message.filePath);
                    document.body.innerHTML = '<h1 style="color: red; text-align: center; margin-top: 50px;">File has been deleted</h1>';
                } else {
                    console.log('[AUTO-REFRESH] File deleted but not watched:', message.filePath);
                }
                break;
                
            case 'file_renamed':
                if (this.isFileMatch(message.oldPath)) {
                    console.log('[AUTO-REFRESH] Watched file renamed from', message.oldPath, 'to', message.newPath);
                    // Update our watched path and refresh
                    this.filePath = this.normalizePath(message.newPath);
                    this.onRefresh(message);
                } else {
                    console.log('[AUTO-REFRESH] File renamed but not watched:', message.oldPath, '->', message.newPath);
                }
                break;
                
            case 'error':
                console.error('[AUTO-REFRESH] Server error:', message.message);
                break;
        }
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[AUTO-REFRESH] Max reconnection attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`[AUTO-REFRESH] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
    }
    
    /**
     * Check if a file path matches the one we're watching
     * Handles different path normalization scenarios
     */
    isFileMatch(eventFilePath) {
        const normalizedEventPath = this.normalizePath(eventFilePath);
        const match = normalizedEventPath === this.filePath;
        
        if (match) {
            console.log('[AUTO-REFRESH] File match found:', normalizedEventPath, '===', this.filePath);
        }
        
        return match;
    }
    
    /**
     * Normalize file path for consistent comparison
     * Removes leading slashes and normalizes separators
     */
    normalizePath(filePath) {
        if (!filePath) return '';
        
        // Remove leading slash if present
        let normalized = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        
        // Normalize path separators and resolve relative paths
        normalized = normalized.replace(/\\/g, '/').replace(/\/+/g, '/');
        
        return normalized;
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Initialize auto-refresh
function initAutoRefresh(filePath, cb) {
    if (!cb) {
        cb = () => {
            window.location.reload();
        }
    }
    if (typeof AutoRefresh !== 'undefined') {
        autoRefresh = new AutoRefresh(filePath, () => {
            console.log('File changed, refreshing content');
            cb && cb();
        });
    } else {
        setTimeout(initAutoRefresh, 100);
    }
}

window.addEventListener('beforeunload', () => {
    if (autoRefresh) {
        autoRefresh.disconnect();
    }
});

// Export for use in templates
export { initAutoRefresh };
