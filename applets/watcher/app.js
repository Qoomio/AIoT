/**
 * File Watcher Service
 * 
 * This module provides real-time file watching capabilities for the editor system.
 * It detects when files are modified externally and notifies connected editor clients.
 * Uses a single project root watcher for all file monitoring.
 */

import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';


// File path validation and sanitization removed - not needed for broadcast approach



class FileWatcher {
  constructor() {
    this.clients = new Map();  // Map<clientId, {ws, clientId}>
    this.debounceTimers = new Map(); // Map<filePath, timeoutId>
    this.debounceDelay = 300; // 300ms debounce delay
    
    // Project root watcher for all file monitoring
    this.projectRootWatcher = null; // Single chokidar watcher for entire project
    this.projectRoot = process.cwd(); // Project root directory
    this.recentUnlinks = new Map(); // Map<filePath, timestamp>
    this.rawRenameEvents = new Map(); // Map<filePath, eventData> for raw rename events
    this.renameTimeout = 1000; // 1 second window for rename detection
    this.isProjectWatcherActive = false;
    
    // Initialize project root watcher at startup
    this.ensureProjectRootWatcher();
  }
  
  /**
   * Add a new client connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} clientId - Unique client identifier
   */
  addClient(ws, clientId) {
    console.log('[WATCHER] Adding client:', clientId);
    this.clients.set(clientId, { ws, clientId });
    
    // Handle client disconnect
    ws.on('close', () => {
      this.removeClient(clientId);
    });
    
    ws.on('error', (error) => {
      console.error('[WATCHER] Client WebSocket error:', error);
      this.removeClient(clientId);
    });
  }
  
  /**
   * Remove a client connection
   * @param {string} clientId - Client identifier
   */
  removeClient(clientId) {
    console.log('[WATCHER] Removing client:', clientId);
    
    // Remove client from clients map
    this.clients.delete(clientId);
  }
  
  /**
   * Acknowledge watch request from client (simplified - all clients get all events)
   * @param {string} clientId - Client identifier
   * @param {string[]} filePaths - Array of file paths (for logging only)
   */
  acknowledgeWatchRequest(clientId, filePaths) {
    console.log('[WATCHER] Client', clientId, 'requested to watch files:', filePaths);
    console.log('[WATCHER] All clients receive all file events - client will filter locally');
  }
  
  
  /**
   * Ensure the project root watcher is active
   */
  ensureProjectRootWatcher() {
    console.log('[WATCHER] ensureProjectRootWatcher called, isActive:', this.isProjectWatcherActive, 'watcher exists:', !!this.projectRootWatcher);
    if (this.isProjectWatcherActive || this.projectRootWatcher) {
      console.log('[WATCHER] Project root watcher already active, skipping');
      return; // Already watching project root
    }
    
    // Set flag immediately to prevent multiple watchers
    this.isProjectWatcherActive = true;
    
    try {
      console.log('[WATCHER] Starting project root watcher for file watching and rename detection:', this.projectRoot);
      
      // Detect production environment
      const isProduction = process.env.NODE_ENV === 'production' || 
                          process.env.DOCKER === 'true' || 
                          !process.env.DEV;

      this.projectRootWatcher = chokidar.watch(this.projectRoot, {
        persistent: true,
        ignoreInitial: true,
        usePolling: isProduction,  // Enable polling in production
        interval: isProduction ? 2000 : 1000,  // Longer interval in production
        depth: 10, // Watch subdirectories up to 10 levels deep
        ignorePermissionErrors: true,
        ignored: [
          '**/node_modules/**',
          '**/\.git/**',
          '**/\.next/**',
          '**/dist/**',
          '**/build/**',
          '**/logs/**',
          '**/*.log',
          '**/tmp/**',
          '**/temp/**',
          '**/monaco-editor/**'
        ]
      });
      
      // Track file deletions for rename detection AND notify clients
      this.projectRootWatcher.on('unlink', (filePath) => {
        // Skip logging for log files to prevent infinite loops
        if (filePath && (filePath.includes('/logs/') || filePath.endsWith('.log'))) {
          return;
        }
        console.log('[WATCHER] Project watcher detected UNLINK:', filePath);
        
        // Notify all clients about file deletion
        this.handleFileDelete(filePath);
        
        // Also track for rename detection
        this.trackUnlinkForRename(filePath);
      });
      
      // Track file additions for rename detection
      this.projectRootWatcher.on('add', (filePath) => {
        // Skip logging for log files to prevent infinite loops
        if (filePath && (filePath.includes('/logs/') || filePath.endsWith('.log'))) {
          return;
        }
        console.log('[WATCHER] Project watcher detected ADD:', filePath);
        this.checkForRename(filePath);
      });
      
      // Track all file changes and notify clients
      this.projectRootWatcher.on('change', (filePath) => {
        // Skip logging for log files to prevent infinite loops
        if (filePath && (filePath.includes('/logs/') || filePath.endsWith('.log'))) {
          return;
        }
        console.log('[WATCHER] Project watcher detected CHANGE:', filePath);
        
        // Notify all clients about file change
        this.handleFileChange(filePath);
      });
      
      this.projectRootWatcher.on('addDir', (dirPath) => {
        // Skip logging for log files to prevent infinite loops
        if (dirPath && dirPath.includes('/logs/')) {
          return;
        }
        console.log('[WATCHER] Project watcher detected ADD_DIR:', dirPath);
      });
      
      this.projectRootWatcher.on('unlinkDir', (dirPath) => {
        // Skip logging for log files to prevent infinite loops
        if (dirPath && dirPath.includes('/logs/')) {
          return;
        }
        console.log('[WATCHER] Project watcher detected UNLINK_DIR:', dirPath);
      });
      
      this.projectRootWatcher.on('raw', (event, path, details) => {
        // Skip logging for log files to prevent infinite loops
        if (path && (path.includes('/logs/') || path.endsWith('.log'))) {
          return;
        }
        
        console.log('[WATCHER] Project watcher RAW event:', event, path, details);
        
        // Handle direct rename events from filesystem
        if (event === 'rename' && details && details.watchedPath) {
          // This is a filesystem rename event
          // We need to determine if it's a source or target of a rename
          const fullPath = path.startsWith('/') ? path : `${details.watchedPath}/${path}`;
          this.handleRawRenameEvent(fullPath, event, details);
        }
      });
      
      this.projectRootWatcher.on('error', (error) => {
        console.error('[WATCHER] Error in project root watcher:', error);
      });
      
      this.projectRootWatcher.on('ready', () => {
        console.log('[WATCHER] Project root watcher ready and monitoring:', this.projectRoot);
        this.isProjectWatcherActive = true;
      });
      
      console.log('[WATCHER] Project root watcher initialized at startup');
    } catch (error) {
      console.error('[WATCHER] Failed to start project root watcher:', error);
      throw error; // Fail startup if watcher can't be initialized
    }
  }
  
  /**
   * Track a file unlink for potential rename detection
   * @param {string} filePath - Unlinked file path
   */
  trackUnlinkForRename(filePath) {
    console.log('[WATCHER] File unlinked, tracking for potential rename:', filePath);
    this.recentUnlinks.set(filePath, Date.now());
    
    // Clean up old unlink records
    this.cleanupOldUnlinks();
    
    // If no corresponding add event occurs within timeout, treat as regular delete
    setTimeout(() => {
      if (this.recentUnlinks.has(filePath)) {
        this.recentUnlinks.delete(filePath);
        console.log('[WATCHER] No rename detected for:', filePath, '- treating as delete');
        
        // File was already handled by unlink event, no need to handle again
      }
    }, this.renameTimeout);
  }
  
  /**
   * Check if a newly added file is the result of a rename
   * @param {string} filePath - Newly added file path
   */
  checkForRename(filePath) {
    const possibleSource = this.findRenameSource(filePath);
    
    if (possibleSource) {
      console.log('[WATCHER] Rename detected:', possibleSource, '->', filePath);
      this.handleFileRename(possibleSource, filePath);
      this.recentUnlinks.delete(possibleSource);
    } else {
      console.log('[WATCHER] New file added:', filePath);
    }
  }
  
  /**
   * Find a potential rename source for a newly added file
   * @param {string} newFilePath - The newly added file path
   * @returns {string|null} - The potential source file path or null
   */
  findRenameSource(newFilePath) {
    const now = Date.now();
    const newFileDir = path.dirname(newFilePath);
    const newFileExt = path.extname(newFilePath);
    
    // Look for recent unlinks in the same directory with the same extension
    for (const [unlinkPath, timestamp] of this.recentUnlinks.entries()) {
      if (now - timestamp < this.renameTimeout) {
        const unlinkDir = path.dirname(unlinkPath);
        const unlinkExt = path.extname(unlinkPath);
        
        // Same directory and extension - likely a rename
        if (unlinkDir === newFileDir && unlinkExt === newFileExt) {
          return unlinkPath;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Handle file rename
   * @param {string} oldPath - Original file path
   * @param {string} newPath - New file path
   */
  handleFileRename(oldPath, newPath) {
    console.log('[WATCHER] File renamed:', oldPath, '->', newPath);
    
    const message = {
      type: 'file_renamed',
      oldPath: path.relative(this.projectRoot, oldPath),
      newPath: path.relative(this.projectRoot, newPath),
      timestamp: Date.now()
    };
    
    // Notify all clients about the rename
    this.notifyAllClients(message);
  }
  
  /**
   * Handle raw rename events from the filesystem
   * @param {string} filePath - File path from rename event
   * @param {string} event - Event type
   * @param {object} details - Event details
   */
  handleRawRenameEvent(filePath, event, details) {
    console.log('[WATCHER] Processing raw rename event for:', filePath);
    
    // Track recent rename events and try to correlate them using timestamps and file patterns
    if (!this.rawRenameEvents) {
      this.rawRenameEvents = new Map();
    }
    
    const now = Date.now();
    this.rawRenameEvents.set(filePath, {
      timestamp: now,
      event: event,
      details: details
    });
    
    // Clean up old rename events
    for (const [path, data] of this.rawRenameEvents.entries()) {
      if (now - data.timestamp > this.renameTimeout) {
        this.rawRenameEvents.delete(path);
      }
    }
    
    // Try to find rename pairs
    this.detectRenameFromRawEvents();
  }
  
  /**
   * Try to detect renames from raw filesystem events
   */
  detectRenameFromRawEvents() {
    if (!this.rawRenameEvents || this.rawRenameEvents.size < 2) {
      return;
    }
    
    const events = Array.from(this.rawRenameEvents.entries());
    const now = Date.now();
    
    // Look for pairs of rename events that happened close together
    for (let i = 0; i < events.length - 1; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const [path1, data1] = events[i];
        const [path2, data2] = events[j];
        
        // Check if they happened close together (within rename timeout)
        const timeDiff = Math.abs(data1.timestamp - data2.timestamp);
        if (timeDiff < this.renameTimeout) {
          // Check if one file exists and the other doesn't
          const exists1 = fs.existsSync(path1);
          const exists2 = fs.existsSync(path2);
          
          if (exists1 && !exists2) {
            // path1 exists, path2 doesn't - likely renamed FROM path2 TO path1
            console.log('[WATCHER] Detected rename via raw events:', path2, '->', path1);
            this.handleFileRename(path2, path1);
            this.rawRenameEvents.delete(path1);
            this.rawRenameEvents.delete(path2);
            return;
          } else if (!exists1 && exists2) {
            // path2 exists, path1 doesn't - likely renamed FROM path1 TO path2
            console.log('[WATCHER] Detected rename via raw events:', path1, '->', path2);
            this.handleFileRename(path1, path2);
            this.rawRenameEvents.delete(path1);
            this.rawRenameEvents.delete(path2);
            return;
          }
        }
      }
    }
  }
  
  /**
   * Clean up old unlink records
   */
  cleanupOldUnlinks() {
    const now = Date.now();
    for (const [filePath, timestamp] of this.recentUnlinks.entries()) {
      if (now - timestamp > this.renameTimeout) {
        this.recentUnlinks.delete(filePath);
      }
    }
  }
  
  /**
   * Handle file change event with debouncing
   * @param {string} filePath - Changed file path
   */
  handleFileChange(filePath) {
    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new debounce timer
    const timer = setTimeout(() => {
      this.processFileChange(filePath);
      this.debounceTimers.delete(filePath);
    }, this.debounceDelay);
    
    this.debounceTimers.set(filePath, timer);
  }
  
  /**
   * Process file change by reading content and notifying clients
   * @param {string} filePath - Changed file path
   */
  processFileChange(filePath) {
    console.log('[WATCHER] File changed:', filePath);
    
    fs.readFile(filePath, { encoding: 'utf8' }, (err, content) => {
      if (err) {
        console.error('[WATCHER] Error reading changed file:', filePath, err);
        return;
      }
      
      const message = {
        type: 'file_changed',
        filePath: path.relative(this.projectRoot, filePath),
        content: content,
        timestamp: Date.now()
      };
      
      this.notifyAllClients(message);
    });
  }
  
  /**
   * Handle file deletion
   * @param {string} filePath - Deleted file path
   */
  handleFileDelete(filePath) {
    console.log('[WATCHER] File deleted:', filePath);
    
    const message = {
      type: 'file_deleted',
      filePath: path.relative(this.projectRoot, filePath),
      timestamp: Date.now()
    };
    
    // Notify all clients about the deletion
    this.notifyAllClients(message);
  }
  
  
  /**
   * Notify all connected clients
   * @param {Object} message - Message to send
   */
  notifyAllClients(message) {
    console.log('[WATCHER] Notifying all', this.clients.size, 'clients');
    this.clients.forEach((clientConnection, clientId) => {
      if (clientConnection.ws.readyState === 1) { // WebSocket.OPEN
        try {
          clientConnection.ws.send(JSON.stringify(message), { binary: false });
          console.log('[WATCHER] Sent message to client:', clientId, message.type);
        } catch (error) {
          console.error('[WATCHER] Error sending message to client:', clientId, error);
          this.removeClient(clientId);
        }
      }
    });
  }
  
  /**
   * Get statistics about current watching state
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      totalClients: this.clients.size,
      projectRootWatcher: this.isProjectWatcherActive
    };
  }
  
  /**
   * Cleanup all resources
   */
  cleanup() {
    console.log('[WATCHER] Cleaning up all resources...');
    
    // Clear all debounce timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    
    // Close project root watcher
    if (this.projectRootWatcher) {
      try {
        this.projectRootWatcher.close();
        console.log('[WATCHER] Project root watcher closed');
      } catch (error) {
        console.error('[WATCHER] Error closing project root watcher:', error);
      }
    }
    
    // Clear all data structures
    this.projectRootWatcher = null;
    this.isProjectWatcherActive = false;
    this.recentUnlinks.clear();
    this.rawRenameEvents.clear();
    this.clients.clear();
  }
}

// Create singleton instance
const fileWatcher = new FileWatcher();

// Graceful shutdown
process.on('SIGINT', () => {
  fileWatcher.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  fileWatcher.cleanup();
  process.exit(0);
});

export default fileWatcher;