/**
 * Unified WebSocket Router
 * 
 * This module provides a unified WebSocket server that routes connections
 * to different handlers based on the URL path. This prevents conflicts
 * between multiple WebSocket services on the same HTTP server.
 */

import WebSocket, { WebSocketServer } from 'ws';
import url from 'url';

class WebSocketRouter {
  constructor() {
    this.routes = new Map(); // Map<path, handler>
    this.wss = null;
  }

  /**
   * Initialize the WebSocket server
   * @param {http.Server} server - HTTP server instance
   */
  initialize(server) {
    this.wss = new WebSocketServer({ 
      server,
      verifyClient: (info) => {
        // Parse the URL to get the path
        const pathname = url.parse(info.req.url).pathname;
        
        // Check if we have a handler for this path
        const hasHandler = this.routes.has(pathname);
        
        if (!hasHandler) {
          console.log(`[WS-ROUTER] No handler found for path: ${pathname}`);
        }
        
        return hasHandler;
      }
    });

    this.wss.on('connection', (ws, req) => {
      const pathname = url.parse(req.url).pathname;
      const handler = this.routes.get(pathname);
      
      if (handler) {
        console.log(`[WS-ROUTER] Routing connection to: ${pathname}`);
        handler(ws, req);
      } else {
        console.log(`[WS-ROUTER] No handler for path: ${pathname}, closing connection`);
        ws.close(1000, 'No handler for this path');
      }
    });

    console.log(`[WS-ROUTER] Unified WebSocket server initialized`);
  }

  /**
   * Register a WebSocket handler for a specific path
   * @param {string} path - URL path (e.g., '/terminal/_ws')
   * @param {Function} handler - Handler function (ws, req) => {}
   */
  addRoute(path, handler) {
    if (this.routes.has(path)) {
      console.warn(`[WS-ROUTER] Warning: Overriding existing handler for path: ${path}`);
    }
    
    this.routes.set(path, handler);
    console.log(`[WS-ROUTER] Registered handler for path: ${path}`);
  }

  /**
   * Remove a WebSocket handler for a specific path
   * @param {string} path - URL path to remove
   */
  removeRoute(path) {
    const removed = this.routes.delete(path);
    if (removed) {
      console.log(`[WS-ROUTER] Removed handler for path: ${path}`);
    }
    return removed;
  }

  /**
   * Get all registered routes
   * @returns {Array<string>} Array of registered paths
   */
  getRoutes() {
    return Array.from(this.routes.keys());
  }

  /**
   * Close the WebSocket server
   */
  close() {
    if (this.wss) {
      this.wss.close();
      console.log(`[WS-ROUTER] WebSocket server closed`);
    }
  }
}

// Create a singleton instance
const wsRouter = new WebSocketRouter();

export {
  WebSocketRouter,
  wsRouter
};