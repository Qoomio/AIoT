/**
 * File Watcher WebSocket API
 * 
 * This module provides WebSocket endpoints for real-time file synchronization
 * between the server and editor clients.
 */

import WebSocket from 'ws';
import fileWatcher from './app.js';

// Generate a unique boot ID when the server starts
const BOOT_ID = `boot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
console.log('[WATCHER] Server boot ID:', BOOT_ID);

// Store active WebSocket connections
const activeConnections = new Map(); // Map<clientId, { ws, connectedAt }>

function logActivity(source, action, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${source}: ${action}`, details);
}

/**
 * Generate unique client ID
 * @returns {string} Unique client identifier
 */
function generateClientId() {
  return 'client-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * File sync WebSocket handler for unified router
 * @param {WebSocket} ws - WebSocket connection
 * @param {http.IncomingMessage} req - HTTP request object
 */
function fileSyncWebSocketHandler(ws, req) {
  const clientId = generateClientId();
  const clientIP = req.socket.remoteAddress;
  
  // Parse query parameters
  const url = new URL(req.url, `ws://${req.headers.host}`);
  const awaitRestart = url.searchParams.get('awaitRestart');
  const clientBootId = url.searchParams.get('bootId');
  
  console.log(`[SYNC] New editor sync connection: ${clientId} from ${clientIP}`);
  
  // If client is waiting for restart and bootId has changed, notify immediately
  if (awaitRestart === '1' && clientBootId && clientBootId !== BOOT_ID) {
    console.log(`[SYNC] Service restart detected! Client bootId: ${clientBootId}, Server bootId: ${BOOT_ID}`);
    ws.send(JSON.stringify({
      type: 'service_restarted',
      oldBootId: clientBootId,
      newBootId: BOOT_ID,
      timestamp: Date.now(),
      message: 'Service has been restarted'
    }));
    // Keep connection open briefly then close
    setTimeout(() => ws.close(), 1000);
    return;
  }
  
  // If client is waiting for restart but bootId hasn't changed yet, 
  // keep connection open and they'll reconnect when service actually restarts
  if (awaitRestart === '1') {
    console.log(`[SYNC] Client waiting for restart, but service hasn't restarted yet. Keeping connection open.`);
    // Connection will naturally close when service restarts
    return;
  }
  
  logActivity('file_sync', 'connection_established', { clientId, clientIP });

  // Store connection
  activeConnections.set(clientId, {
    ws: ws,
    connectedAt: new Date(),
    lastPing: new Date()
  });

  // Add client to file watcher
  fileWatcher.addClient(ws, clientId);

  // Send initial connection confirmation with bootId
  ws.send(JSON.stringify({
    type: 'connection_established',
    clientId: clientId,
    bootId: BOOT_ID,
    timestamp: Date.now(),
    message: 'File sync WebSocket connected'
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleClientMessage(clientId, message, ws);
    } catch (error) {
      console.error(`[SYNC] Error parsing message from ${clientId}:`, error);
      logActivity('file_sync', 'message_parse_error', { clientId, error: error.message });
      
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
        timestamp: Date.now()
      }));
    }
  });

  // Handle client disconnect
  ws.on('close', (code, reason) => {
    console.log(`[SYNC] Client ${clientId} disconnected: ${code} ${reason}`);
    logActivity('file_sync', 'connection_closed', { clientId, code, reason: reason.toString() });
    
    // Cleanup
    activeConnections.delete(clientId);
    fileWatcher.removeClient(clientId);
  });

  // Handle WebSocket errors
  ws.on('error', (error) => {
    console.error(`[SYNC] WebSocket error for client ${clientId}:`, error);
    logActivity('file_sync', 'websocket_error', { clientId, error: error.message });
    
    // Cleanup on error
    activeConnections.delete(clientId);
    fileWatcher.removeClient(clientId);
  });

  // Handle ping/pong for connection health
  ws.on('pong', () => {
    const connection = activeConnections.get(clientId);
    if (connection) {
      connection.lastPing = new Date();
    }
  });
}

/**
 * Register file sync WebSocket handler with unified router
 * @param {WebSocketRouter} wsRouter - WebSocket router instance
 */
function registerEditorWebSocket(wsRouter) {
  wsRouter.addRoute('/watcher/_sync', fileSyncWebSocketHandler);
  
  // Setup health check interval if not already set
  if (!registerEditorWebSocket.healthCheckStarted) {
    // Periodic cleanup and health check
    const healthCheckInterval = setInterval(() => {
      const now = new Date();
      const staleThreshold = 60000; // 60 seconds

      activeConnections.forEach((connection, clientId) => {
        const timeSinceLastPing = now - connection.lastPing;
        
        if (timeSinceLastPing > staleThreshold) {
          console.log(`[SYNC] Removing stale connection: ${clientId}`);
          connection.ws.terminate();
          activeConnections.delete(clientId);
          fileWatcher.removeClient(clientId);
        } else {
          // Send ping
          if (connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.ping();
          }
        }
      });
    }, 30000); // Check every 30 seconds

    registerEditorWebSocket.healthCheckStarted = true;
    
    // Store interval reference for cleanup
    registerEditorWebSocket.healthCheckInterval = healthCheckInterval;
  }
}

/**
 * Handle messages from clients
 * @param {string} clientId - Client identifier
 * @param {Object} message - Parsed message object
 * @param {WebSocket} ws - WebSocket connection
 */
function handleClientMessage(clientId, message, ws) {
  console.log(`[SYNC] Message from ${clientId}:`, message.type);
  
  try {
    switch (message.type) {
      case 'watch_files':
        handleWatchFiles(clientId, message, ws);
        break;
        
      case 'stop_watching':
        handleStopWatching(clientId, message, ws);
        break;
        
      case 'ping':
        handlePing(clientId, ws);
        break;
        
      case 'get_stats':
        handleGetStats(clientId, ws);
        break;

      // 커서 업데이트 처리
      case 'cursor_update':
        handleCursorUpdate(clientId, message, ws);
        break;
        
      default:
        console.warn(`[SYNC] Unknown message type from ${clientId}:`, message.type);
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${message.type}`,
          timestamp: Date.now()
        }));
    }
  } catch (error) {
    console.error(`[SYNC] Error handling message from ${clientId}:`, error);
    logActivity('file_sync', 'message_handler_error', { 
      clientId, 
      messageType: message.type, 
      error: error.message 
    });
    
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Internal server error',
      timestamp: Date.now()
    }));
  }
}

/**
 * 커서 업데이트를 다른 클라이언트에게 브로드캐스트
 * @param {string} clientId - 메시지를 보낸 클라이언트 ID
 * @param {Object} message - 커서 업데이트 메시지
 * @param {WebSocket} ws - 메시지를 보낸 WebSocket 연결
 */
function handleCursorUpdate(clientId, message, ws) {
  const { filePath, position, selection } = message;

  // 다른 모든 클라이언트에게 브로드캐스트 (1:1 관계이므로 하나의 원격 사용자만)
  activeConnections.forEach((connection, otherClientId) => {
    // 자신에게는 보내지 않음
    if (otherClientId === clientId) return;

    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify({
        type: 'remote_cursor_update',
        userId: clientId, // userId로 변경
        filePath: filePath,
        position: position,
        selection: selection,
        color: '#00ff00', // 기본 색상
        timestamp: Date.now()
      }));
    }
  });
}

/**
 * Handle watch_files message
 * @param {string} clientId - Client identifier
 * @param {Object} message - Message object
 * @param {WebSocket} ws - WebSocket connection
 */
function handleWatchFiles(clientId, message, ws) {
  const { files = [] } = message;
  
  if (!Array.isArray(files)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'files must be an array',
      timestamp: Date.now()
    }));
    return;
  }

  logActivity('file_sync', 'watch_files_request', { clientId, fileCount: files.length });
  
  // Acknowledge the request (all clients get all events)
  fileWatcher.acknowledgeWatchRequest(clientId, files);
  
  // Send confirmation
  ws.send(JSON.stringify({
    type: 'watch_files_confirmed',
    files: files,
    message: 'All file events will be sent to this client',
    timestamp: Date.now()
  }));
  
  console.log(`[SYNC] Client ${clientId} will receive all file events for ${files.length} requested files`);
}

/**
 * Handle stop_watching message
 * @param {string} clientId - Client identifier
 * @param {Object} message - Message object
 * @param {WebSocket} ws - WebSocket connection
 */
function handleStopWatching(clientId, message, ws) {
  logActivity('file_sync', 'stop_watching_request', { clientId });
  
  // Acknowledge stop request (no action needed since we broadcast all events)
  
  // Send confirmation
  ws.send(JSON.stringify({
    type: 'stop_watching_confirmed',
    message: 'Client will continue to receive all file events (filtering is client-side)',
    timestamp: Date.now()
  }));
  
  console.log(`[SYNC] Client ${clientId} acknowledged stop watching request`);
}

/**
 * Handle ping message
 * @param {string} clientId - Client identifier
 * @param {WebSocket} ws - WebSocket connection
 */
function handlePing(clientId, ws) {
  const connection = activeConnections.get(clientId);
  if (connection) {
    connection.lastPing = new Date();
  }
  
  ws.send(JSON.stringify({
    type: 'pong',
    timestamp: Date.now()
  }));
}

/**
 * Handle get_stats message
 * @param {string} clientId - Client identifier
 * @param {WebSocket} ws - WebSocket connection
 */
function handleGetStats(clientId, ws) {
  const watcherStats = fileWatcher.getStats();
  
  ws.send(JSON.stringify({
    type: 'stats',
    data: {
      ...watcherStats,
      connectionCount: activeConnections.size,
      uptime: process.uptime()
    },
    timestamp: Date.now()
  }));
}

/**
 * Get current connection statistics
 * @returns {Object} Connection statistics
 */
function getConnectionStats() {
  return {
    activeConnections: activeConnections.size,
    connections: [...activeConnections.entries()].map(([clientId, conn]) => ({
      clientId,
      connectedAt: conn.connectedAt,
      lastPing: conn.lastPing
    }))
  };
}

/**
 * Health check endpoint for HTTP (useful behind proxies)
 */
function handleHealth(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'watcher', timestamp: Date.now() }));
}

/**
 * HTTP fallback for /watcher/_sync when Upgrade header is missing
 * Helps diagnose proxy issues by returning explicit guidance
 */
function handleSyncHttpFallback(req, res) {
  res.writeHead(426, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: false,
    error: 'Upgrade Required',
    message: 'This endpoint expects a WebSocket upgrade. Ensure proxy forwards Upgrade/Connection headers to the backend.',
    path: '/watcher/_sync',
    requiredHeaders: {
      Upgrade: 'websocket',
      Connection: 'upgrade'
    }
  }));
}

/**
 * Standard API Module Export Format for applet system
 */
const api = {
  // Metadata about this sub-applet
  meta: {
    name: 'File Sync WebSocket',
    description: 'Real-time file synchronization via WebSocket',
    version: '1.0.0',
    author: 'System'
  },

  // Main functions
  registerEditorWebSocket,
  getConnectionStats,
  
  // HTTP Routes (health and HTTP fallback to aid proxy diagnostics)
  routes: [
    {
      path: '/watcher/health',
      method: 'GET',
      handler: handleHealth
    },
    {
      path: '/watcher/_sync',
      method: 'GET',
      handler: handleSyncHttpFallback
    }
  ],
  
  // No HTTP prefix needed
  prefix: null,

  websocket: {
    path: '/watcher/_sync',
    handler: fileSyncWebSocketHandler,
    register: registerEditorWebSocket,
  }
};

export default api;