/**
 * Consoler API Routes
 * Handles console log retrieval, streaming, and management
 */

import consoleCapture from './console-capture.js';

// Store Server-Sent Events connections
const sseConnections = new Set();

/**
 * Handle Server-Sent Events connections
 */
function handleSSEConnection(req, res) {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  // Add connection to set
  sseConnections.add(res);

  // Create listener function for this connection
  const listener = (logEntry) => {
    if (!res.destroyed) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'log', data: logEntry })}\n\n`);
      } catch (error) {
        console.error('Error writing to SSE connection:', error);
        sseConnections.delete(res);
      }
    }
  };

  // Add listener to console capture
  consoleCapture.addListener(listener);

  // Handle client disconnect
  req.on('close', () => {
    sseConnections.delete(res);
    consoleCapture.removeListener(listener);
  });

  req.on('error', () => {
    sseConnections.delete(res);
    consoleCapture.removeListener(listener);
  });

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    if (!res.destroyed) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
      } catch (error) {
        clearInterval(heartbeat);
        sseConnections.delete(res);
        consoleCapture.removeListener(listener);
      }
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);
}

/**
 * Get logs with optional filtering
 */
function getLogs(req, res) {
  try {
    const options = {};

    // Parse query parameters
    if (req.query.level) {
      options.level = req.query.level;
    }

    if (req.query.search) {
      options.search = req.query.search;
    }

    if (req.query.since) {
      options.since = req.query.since;
    }

    if (req.query.limit) {
      options.limit = parseInt(req.query.limit, 10);
    }

    if (req.query.offset) {
      options.offset = parseInt(req.query.offset, 10);
    }

    const logs = consoleCapture.getLogs(options);
    const stats = consoleCapture.getStats();

    res.json({
      success: true,
      logs,
      stats,
      total: logs.length
    });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve logs'
    });
  }
}

/**
 * Get log statistics
 */
function getLogStats(req, res) {
  try {
    const stats = consoleCapture.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting log stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve log statistics'
    });
  }
}

/**
 * Clear all logs
 */
function clearLogs(req, res) {
  try {
    consoleCapture.clearLogs();
    
    // Notify all SSE connections
    sseConnections.forEach(connection => {
      if (!connection.destroyed) {
        try {
          connection.write(`data: ${JSON.stringify({ type: 'clear' })}\n\n`);
        } catch (error) {
          console.error('Error notifying SSE connection of clear:', error);
        }
      }
    });

    res.json({
      success: true,
      message: 'All logs cleared'
    });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear logs'
    });
  }
}

/**
 * Export logs as downloadable file
 */
function exportLogs(req, res) {
  try {
    const logs = consoleCapture.getLogs();
    const exportData = {
      exported: new Date().toISOString(),
      total: logs.length,
      logs
    };

    const filename = `console-logs-${new Date().toISOString().split('T')[0]}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error('Error exporting logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export logs'
    });
  }
}

/**
 * Delete specific log entries
 */
function deleteLogs(req, res) {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids)) {
      return res.status(400).json({
        success: false,
        error: 'IDs must be an array'
      });
    }

    // For now, we'll just clear all logs since we don't have individual deletion
    // In a more advanced version, we would implement individual log deletion
    consoleCapture.clearLogs();

    res.json({
      success: true,
      message: `Cleared all logs (individual deletion not implemented)`
    });
  } catch (error) {
    console.error('Error deleting logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete logs'
    });
  }
}

// Import the console page handler from app.js
import { handleConsoleRoute } from './app.js';

// Export API routes
const api = {
  routes: [
    {
      path: '/console',
      method: 'GET',
      handler: handleConsoleRoute
    },
    {
      path: '/_api/logs',
      method: 'GET',
      handler: getLogs
    },
    {
      path: '/_api/logs/stream',
      method: 'GET',
      handler: handleSSEConnection
    },
    {
      path: '/_api/logs/stats',
      method: 'GET',
      handler: getLogStats
    },
    {
      path: '/_api/logs/clear',
      method: 'GET',
      handler: clearLogs
    },
    {
      path: '/_api/logs/export',
      method: 'GET',
      handler: exportLogs
    },
    {
      path: '/_api/logs',
      method: 'DELETE',
      handler: deleteLogs
    }
  ],
  prefix: '' // No prefix since we want the API routes to be global
};

export default api;