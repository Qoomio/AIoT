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


/**
 * Parse .gitignore file and convert patterns to chokidar-compatible ignore patterns
 * @param {string} projectRoot - The project root directory
 * @returns {Array} Array of ignore patterns (strings and functions)
 */
function parseGitignore(projectRoot) {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const ignorePatterns = [];
  
  // Always ignore .git directory
  ignorePatterns.push((filePath) => filePath.includes('/.git/') || filePath.endsWith('/.git'));
  
  // Always ignore Python virtual environments and site-packages (thousands of files)
  ignorePatterns.push((filePath) => {
    const lower = filePath.toLowerCase();
    return (
      lower.includes('/site-packages/') ||
      lower.includes('/__pycache__/') ||
      lower.includes('/.venv/') ||
      lower.includes('/venv/') ||
      lower.includes('/.env/') ||
      lower.includes('/lib/python') ||
      lower.includes('/lib64/python') ||
      lower.endsWith('.pyc')
    );
  });
  
  // Ignore monaco-editor (bundled library with thousands of files)
  ignorePatterns.push((filePath) => filePath.includes('/monaco-editor/'));
  
  // Ignore versioner backups (can have many files)
  ignorePatterns.push((filePath) => filePath.includes('/.versions/'));
  
  try {
    if (!fs.existsSync(gitignorePath)) {
      console.log('[WATCHER] No .gitignore file found, using default ignores');
      return ignorePatterns;
    }
    
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const lines = gitignoreContent.split('\n');
    
    for (const line of lines) {
      // Trim whitespace
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#') || trimmed === 'projects/') {
        continue;
      }
      
      // Convert gitignore pattern to a matcher function
      const matcher = createIgnoreMatcher(trimmed, projectRoot);
      if (matcher) {
        ignorePatterns.push(matcher);
      }
    }
    
    console.log('[WATCHER] Loaded', ignorePatterns.length, 'ignore patterns from .gitignore');
  } catch (error) {
    console.error('[WATCHER] Error reading .gitignore:', error);
  }
  
  return ignorePatterns;
}

/**
 * Create a matcher function for a gitignore pattern
 * @param {string} pattern - The gitignore pattern
 * @param {string} projectRoot - The project root directory
 * @returns {Function|null} A function that returns true if a path should be ignored
 */
function createIgnoreMatcher(pattern, projectRoot) {
  // Handle negation patterns (we'll skip them for simplicity)
  if (pattern.startsWith('!')) {
    return null;
  }
  
  // Remove leading slash (indicates root-relative pattern)
  const isRootRelative = pattern.startsWith('/');
  let cleanPattern = isRootRelative ? pattern.slice(1) : pattern;
  
  // Remove trailing slash (indicates directory)
  const isDirectory = cleanPattern.endsWith('/');
  if (isDirectory) {
    cleanPattern = cleanPattern.slice(0, -1);
  }
  
  // Convert gitignore glob pattern to regex
  const regexPattern = gitignorePatternToRegex(cleanPattern, isRootRelative, projectRoot);
  
  return (filePath) => {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');
    return regexPattern.test(normalizedPath);
  };
}

/**
 * Convert a gitignore pattern to a regular expression
 * @param {string} pattern - The gitignore pattern (without leading/trailing slashes)
 * @param {boolean} isRootRelative - Whether the pattern is anchored to root
 * @param {string} projectRoot - The project root directory
 * @returns {RegExp} The compiled regular expression
 */
function gitignorePatternToRegex(pattern, isRootRelative, projectRoot) {
  // Escape regex special characters except * and ?
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')  // Placeholder for **
    .replace(/\*/g, '[^/]*')            // * matches anything except /
    .replace(/\?/g, '[^/]')             // ? matches single char except /
    .replace(/{{GLOBSTAR}}/g, '.*');    // ** matches everything including /
  
  // Normalize project root for regex
  const normalizedRoot = projectRoot.replace(/\\/g, '/').replace(/[.+^${}()|[\]\\]/g, '\\$&');
  
  if (isRootRelative) {
    // Pattern is anchored to project root
    regexStr = `^${normalizedRoot}/${regexStr}`;
  } else {
    // Pattern can match anywhere in the path
    regexStr = `(^|/)${regexStr}`;
  }
  
  // Match the pattern anywhere in the path (for directories) or at the end (for files)
  regexStr = `${regexStr}($|/)`;
  
  return new RegExp(regexStr);
}



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
      
      // Parse .gitignore and create ignore patterns dynamically
      const ignorePatterns = parseGitignore(this.projectRoot);
      
      this.projectRootWatcher = chokidar.watch(this.projectRoot, {
        persistent: true,
        ignoreInitial: true,
        ignorePermissionErrors: true,
        ignored: ignorePatterns
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
        
        // Log the number of watched files
        const watched = this.projectRootWatcher.getWatched();
        let fileCount = 0;
        let dirCount = 0;
        for (const dir of Object.keys(watched)) {
          dirCount++;
          fileCount += watched[dir].length;
        }
        console.log(`[WATCHER] Watching ${fileCount} files in ${dirCount} directories`);
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
   * Validate watched files against .gitignore patterns
   * @param {Object} watched - Object from getWatched() containing directories and files
   */
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