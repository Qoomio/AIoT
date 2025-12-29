/**
 * Console Capture Module
 * Intercepts console output while preserving original functionality
 */

import util from 'util';

class ConsoleCapture {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000; // Maximum number of logs to store
    this.originalConsole = {};
    this.isCapturing = false;
    this.listeners = []; // For real-time updates
    
    // Store original console methods
    this.originalConsole.log = console.log;
    this.originalConsole.error = console.error;
    this.originalConsole.warn = console.warn;
    this.originalConsole.info = console.info;
    this.originalConsole.debug = console.debug;
  }

  /**
   * Start capturing console output
   */
  start() {
    if (this.isCapturing) {
      return;
    }

    this.isCapturing = true;
    
    // Override console methods
    console.log = (...args) => {
      this.captureLog('log', args);
      this.originalConsole.log(...args);
    };

    console.error = (...args) => {
      this.captureLog('error', args);
      this.originalConsole.error(...args);
    };

    console.warn = (...args) => {
      this.captureLog('warn', args);
      this.originalConsole.warn(...args);
    };

    console.info = (...args) => {
      this.captureLog('info', args);
      this.originalConsole.info(...args);
    };

    console.debug = (...args) => {
      this.captureLog('debug', args);
      this.originalConsole.debug(...args);
    };

    console.log('🔍 Console capture started');
  }

  /**
   * Stop capturing console output
   */
  stop() {
    if (!this.isCapturing) {
      return;
    }

    // Restore original console methods
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
    console.debug = this.originalConsole.debug;

    this.isCapturing = false;
    this.originalConsole.log('🔍 Console capture stopped');
  }

  /**
   * Capture a log entry
   * @param {string} level - Log level (log, error, warn, info, debug)
   * @param {Array} args - Arguments passed to console method
   */
  captureLog(level, args) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(arg => this.formatArgument(arg));
    
    // Get stack trace for errors
    let stackTrace = null;
    if (level === 'error') {
      const error = new Error();
      stackTrace = error.stack;
    }

    const logEntry = {
      id: Date.now() + Math.random(), // Simple unique ID
      timestamp,
      level,
      message: formattedArgs.join(' '),
      args: formattedArgs,
      stackTrace,
      raw: args // Keep raw arguments for debugging
    };

    // Add to logs buffer
    this.logs.push(logEntry);

    // Maintain max logs limit (circular buffer)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest log
    }

    // Notify listeners for real-time updates
    this.notifyListeners(logEntry);
  }

  /**
   * Format argument for logging
   * @param {any} arg - Argument to format
   * @returns {string} Formatted argument
   */
  formatArgument(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    
    if (typeof arg === 'string') {
      return arg;
    }
    
    if (typeof arg === 'number' || typeof arg === 'boolean') {
      return String(arg);
    }
    
    if (typeof arg === 'function') {
      return `[Function: ${arg.name || 'anonymous'}]`;
    }
    
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}`;
    }
    
    if (typeof arg === 'object') {
      try {
        return util.inspect(arg, { 
          depth: 2, 
          colors: false,
          maxArrayLength: 10,
          maxStringLength: 200
        });
      } catch (error) {
        return '[Object - could not serialize]';
      }
    }
    
    return String(arg);
  }

  /**
   * Get all logs
   * @param {Object} options - Filtering options
   * @returns {Array} Array of log entries
   */
  getLogs(options = {}) {
    let filteredLogs = [...this.logs];

    // Filter by level
    if (options.level && options.level !== 'all') {
      filteredLogs = filteredLogs.filter(log => log.level === options.level);
    }

    // Filter by search term
    if (options.search) {
      const searchTerm = options.search.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.message.toLowerCase().includes(searchTerm)
      );
    }

    // Filter by time range
    if (options.since) {
      const sinceTime = new Date(options.since);
      filteredLogs = filteredLogs.filter(log => 
        new Date(log.timestamp) >= sinceTime
      );
    }

    // Pagination
    if (options.limit) {
      const offset = options.offset || 0;
      filteredLogs = filteredLogs.slice(offset, offset + options.limit);
    }

    return filteredLogs;
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
    this.notifyListeners({ type: 'clear' });
  }

  /**
   * Get log statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {
        log: 0,
        error: 0,
        warn: 0,
        info: 0,
        debug: 0
      },
      oldest: null,
      newest: null
    };

    this.logs.forEach(log => {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      
      if (!stats.oldest || log.timestamp < stats.oldest) {
        stats.oldest = log.timestamp;
      }
      
      if (!stats.newest || log.timestamp > stats.newest) {
        stats.newest = log.timestamp;
      }
    });

    return stats;
  }

  /**
   * Add listener for real-time updates
   * @param {Function} listener - Callback function
   */
  addListener(listener) {
    this.listeners.push(listener);
  }

  /**
   * Remove listener
   * @param {Function} listener - Callback function to remove
   */
  removeListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of new log entry
   * @param {Object} logEntry - New log entry
   */
  notifyListeners(logEntry) {
    this.listeners.forEach(listener => {
      try {
        listener(logEntry);
      } catch (error) {
        // Don't let listener errors crash the capture
        this.originalConsole.error('Error in console capture listener:', error);
      }
    });
  }

  /**
   * Set maximum number of logs to store
   * @param {number} maxLogs - Maximum number of logs
   */
  setMaxLogs(maxLogs) {
    this.maxLogs = maxLogs;
    
    // Trim current logs if needed
    if (this.logs.length > maxLogs) {
      this.logs = this.logs.slice(-maxLogs);
    }
  }
}

// Create singleton instance
const consoleCapture = new ConsoleCapture();

export default consoleCapture; 