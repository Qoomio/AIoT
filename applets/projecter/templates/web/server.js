/**
 * Simple Node.js Web Server for Web Project (ESM)
 * 
 * This server serves static files and provides a basic API
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import url from 'url';

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server configuration
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

// MIME types for different file extensions
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain'
};

/**
 * Create HTTP server
 */
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;
    
    // Enable CORS for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);
    
    // API routes
    if (pathname.startsWith('/api/')) {
        handleAPI(req, res, pathname);
        return;
    }
    
    // Serve static files
    handleStaticFile(req, res, pathname);
});

/**
 * Handle API requests
 */
function handleAPI(req, res, pathname) {
    res.setHeader('Content-Type', 'application/json');
    
    try {
        switch (pathname) {
            case '/api/hello':
                if (req.method === 'GET') {
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        success: true,
                        message: 'Hello from the backend!',
                        timestamp: new Date().toISOString(),
                        server: 'Node.js Web Project Server'
                    }));
                } else {
                    sendError(res, 405, 'Method not allowed');
                }
                break;
                
            case '/api/status':
                if (req.method === 'GET') {
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        success: true,
                        status: 'Server is running',
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        version: process.version
                    }));
                } else {
                    sendError(res, 405, 'Method not allowed');
                }
                break;
                
            default:
                sendError(res, 404, 'API endpoint not found');
                break;
        }
    } catch (error) {
        console.error('API Error:', error);
        sendError(res, 500, 'Internal server error');
    }
}

/**
 * Handle static file requests
 */
function handleStaticFile(req, res, pathname) {
    // Default to index.html for root path
    if (pathname === '/') {
        pathname = '/index.html';
    }
    
    const filePath = path.join(__dirname, pathname);
    const ext = path.extname(filePath);
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        sendError(res, 403, 'Forbidden');
        return;
    }
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                sendError(res, 404, 'File not found');
            } else {
                console.error('File read error:', err);
                sendError(res, 500, 'Internal server error');
            }
            return;
        }
        
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
    });
}

/**
 * Send error response
 */
function sendError(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        success: false,
        error: message,
        statusCode
    }));
}

/**
 * Start the server
 */
server.listen(PORT, HOST, () => {
    console.log(`🌐 Web Project Server running at http://${HOST}:${PORT}/`);
    console.log(`📁 Serving files from: ${__dirname}`);
    console.log(`🔗 API endpoints available at /api/*`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log('Press Ctrl+C to stop the server');
});

/**
 * Graceful shutdown
 */
process.on('SIGINT', () => {
    console.log('\n📴 Shutting down server...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
    process.exit(1);
});