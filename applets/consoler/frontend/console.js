/**
 * Consoler Frontend JavaScript
 * Handles real-time console log monitoring and filtering
 */

import { inject as injectNavigater } from '/view/applets/navigater/frontend/navigater.js';

class ConsolerApp {
    constructor() {
        this.logs = [];
        this.filteredLogs = [];
        this.autoScroll = true;
        this.eventSource = null;
        this.searchTerm = '';
        this.levelFilter = 'all';
        
        this.initializeElements();
        this.bindEvents();
        this.loadInitialLogs();
        this.connectEventSource();
    }

    initializeElements() {
        this.consoleBody = document.getElementById('consoleBody');
        this.levelFilter = document.getElementById('levelFilter');
        this.searchInput = document.getElementById('searchInput');
        this.clearBtn = document.getElementById('clearBtn');
        this.exportBtn = document.getElementById('exportBtn');
        this.autoScrollControl = document.getElementById('autoScrollControl');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.totalLogs = document.getElementById('totalLogs');
        this.errorCount = document.getElementById('errorCount');
    }

    bindEvents() {
        this.levelFilter.addEventListener('change', () => this.filterLogs());
        this.searchInput.addEventListener('input', () => this.filterLogs());
        this.clearBtn.addEventListener('click', () => this.clearLogs());
        this.exportBtn.addEventListener('click', () => this.exportLogs());
        this.autoScrollControl.addEventListener('click', () => this.toggleAutoScroll());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.clearLogs();
            }
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                this.searchInput.focus();
            }
        });
    }

    async loadInitialLogs() {
        try {
            const response = await fetch('/_api/logs');
            const data = await response.json();
            
            if (data.success) {
                this.logs = data.logs;
                this.filterLogs();
                this.updateStats(data.stats);
            }
        } catch (error) {
            console.error('Error loading initial logs:', error);
        }
    }

    connectEventSource() {
        this.updateConnectionStatus('connecting');
        
        if (this.eventSource) {
            this.eventSource.close();
        }
        
        this.eventSource = new EventSource('/_api/logs/stream');
        
        this.eventSource.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                
                switch (data.type) {
                    case 'connected':
                        this.updateConnectionStatus('connected');
                        break;
                    case 'log':
                        this.addLog(data.data);
                        break;
                    case 'clear':
                        this.logs = [];
                        this.filterLogs();
                        this.updateStats({ total: 0, byLevel: {} });
                        break;
                    case 'heartbeat':
                        // Keep connection alive
                        break;
                }
            } catch (error) {
                console.error('Error parsing SSE data:', error);
            }
        });
        
        this.eventSource.addEventListener('error', (event) => {
            console.error('EventSource error:', event);
            this.updateConnectionStatus('disconnected');
            
            // Attempt to reconnect after 5 seconds
            setTimeout(() => {
                if (this.eventSource.readyState === EventSource.CLOSED) {
                    this.connectEventSource();
                }
            }, 5000);
        });
    }

    addLog(logEntry) {
        this.logs.push(logEntry);
        
        // Maintain max logs to prevent memory issues
        if (this.logs.length > 1000) {
            this.logs.shift();
        }
        
        this.filterLogs();
        this.updateStats();
    }

    filterLogs() {
        const level = this.levelFilter.value;
        const search = this.searchInput.value.toLowerCase();
        
        this.filteredLogs = this.logs.filter(log => {
            const matchesLevel = level === 'all' || log.level === level;
            const matchesSearch = !search || log.message.toLowerCase().includes(search);
            return matchesLevel && matchesSearch;
        });
        
        this.renderLogs();
    }

    renderLogs() {
        if (this.filteredLogs.length === 0) {
            this.consoleBody.innerHTML = '<div class="no-logs">No logs match current filters.</div>';
            return;
        }
        
        const html = this.filteredLogs.map(log => this.createLogHTML(log)).join('');
        this.consoleBody.innerHTML = html;
        
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    createLogHTML(log) {
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        const level = log.level.toUpperCase();
        
        return `
            <div class="log-entry">
                <span class="log-timestamp">${timestamp}</span>
                <span class="log-level ${log.level}">${level}</span>
                <span class="log-message">${this.escapeHtml(log.message)}</span>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateStats(stats = null) {
        if (!stats) {
            stats = this.calculateStats();
        }
        
        this.totalLogs.textContent = `${stats.total} logs`;
        this.errorCount.textContent = `${stats.byLevel.error || 0} errors`;
    }

    calculateStats() {
        const stats = {
            total: this.logs.length,
            byLevel: {}
        };
        
        this.logs.forEach(log => {
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
        });
        
        return stats;
    }

    updateConnectionStatus(status) {
        this.connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        this.connectionStatus.className = `connection-status ${status}`;
    }

    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        this.autoScrollControl.textContent = `Auto-scroll: ${this.autoScroll ? 'ON' : 'OFF'}`;
        this.autoScrollControl.classList.toggle('active', this.autoScroll);
        
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        this.consoleBody.scrollTop = this.consoleBody.scrollHeight;
    }

    async clearLogs() {
        try {
            const response = await fetch('/_api/logs/clear');
            const data = await response.json();
            
            if (data.success) {
                this.logs = [];
                this.filterLogs();
                this.updateStats({ total: 0, byLevel: {} });
            }
        } catch (error) {
            console.error('Error clearing logs:', error);
        }
    }

    exportLogs() {
        window.open('/_api/logs/export', '_blank');
    }
}


const consoler = new ConsolerApp();
injectNavigater('consoler');

export default consoler;