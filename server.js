
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import zlib from 'zlib';

dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

/**
 * Check if content should be compressed
 */
function shouldCompress(contentType, contentLength) {
  // Only compress text-based content
  const compressibleTypes = [
    'text/',
    'application/javascript',
    'application/json',
    'application/xml',
    'application/rss+xml',
    'application/atom+xml',
    'image/svg+xml'
  ];
  
  // Don't compress if content is too small (< 1KB)
  if (contentLength && contentLength < 1024) {
    return false;
  }
  
  return compressibleTypes.some(type => contentType?.startsWith(type));
}

/**
 * Get the best compression encoding based on Accept-Encoding header
 */
function getBestEncoding(acceptEncoding) {
  if (!acceptEncoding) return null;
  
  // Check for gzip support (most common)
  if (acceptEncoding.includes('gzip')) {
    return 'gzip';
  }
  
  // Check for deflate support
  if (acceptEncoding.includes('deflate')) {
    return 'deflate';
  }
  
  return null;
}

/**
 * Compress response data
 */
function compressResponse(data, encoding, callback) {
  if (encoding === 'gzip') {
    zlib.gzip(data, callback);
  } else if (encoding === 'deflate') {
    zlib.deflate(data, callback);
  } else {
    callback(null, data);
  }
}

async function initializeConsole() {
  try {
    // Initialize console capture for consoler applet
    const consoleCapture = await import('./applets/consoler/console-capture.js');
    consoleCapture.default.start();
  } catch(ex) {
    console.error('Error initializing console capture:', ex);
  }
}



// Routing System - Automatic API Route Discovery
const appletsDirectory = path.join(__dirname, 'applets');
let appletRoutes = [];
let wsRouter;
let server;

/**
 * Recursively find all api.js files in the applets directory
 * @param {string} dir - Directory to search
 * @param {Array} results - Array to store results
 * @returns {Array} Array of api.js file paths
 */
function findApiFiles(dir, results = []) {
  try {
    const ignorePath = path.join(appletsDirectory, 'ignore');
    let ignoreFiles = [];
    if (fs.existsSync(ignorePath)) {
      ignoreFiles = fs.readFileSync(ignorePath, 'utf8').split('\n').map(line => path.join(appletsDirectory, line.trim()));
    }
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      if (ignoreFiles.includes(filePath)) {
        continue;
      }
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        findApiFiles(filePath, results);
      } else if (file === 'api.js') {
        // Found an api.js file
        results.push(filePath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }

  return results;
}

/**
 * Load and validate an API file
 * @param {string} filePath - Path to the api.js file
 * @returns {Object|null} Loaded API object or null if invalid
 */
async function loadApiFile(filePath) {
  try {
    // Note: ES modules don't need manual cache clearing like CommonJS

    const api = await import(`file://${path.resolve(filePath)}`).then(module => module.default || module);

    // Validate required structure
    if (!api || typeof api !== 'object') {
      throw new Error('API file must export an object');
    }

    if (!Array.isArray(api.routes)) {
      throw new Error('API file must export a routes array');
    }

    // Validate each route
    for (const route of api.routes) {
      if (!route.path || typeof route.path !== 'string') {
        throw new Error('Each route must have a path string');
      }

      if (!route.method || typeof route.method !== 'string') {
        throw new Error('Each route must have a method string');
      }

      if (!route.handler || typeof route.handler !== 'function') {
        throw new Error('Each route must have a handler function');
      }
    }

    if (api.websocket) {
      if (typeof api.websocket !== 'object') {
        throw new Error('websocket must be an object');
      }

      if (api.websocket.path && typeof api.websocket.path !== 'string') {
        throw new Error('websocket.path must be a string');
      }

      if (api.websocket.handler && typeof api.websocket.handler !== 'function') {
        throw new Error('websocket.handler must be a function');
      }

      if (api.websocket.register && typeof api.websocket.register !== 'function') {
        throw new Error('websocket.register must be a function');
      }
    }

    return api;
  } catch (error) {
    console.error(`Error loading API file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Register routes from an API file
 * @param {Object} api - API object from api.js file
 * @param {string} filePath - Path to the api.js file
 */
function registerRoutes(api, filePath) {
  const appletName = path.basename(path.dirname(filePath));

  // Determine prefix - use api.prefix if specified, otherwise use applet name
  let prefix = '';
  if (api.prefix !== undefined && api.prefix !== null) {
    prefix = api.prefix;
  } else {
    prefix = `/${appletName}`;
  }

  // Ensure prefix starts with / but doesn't end with /
  if (prefix && !prefix.startsWith('/')) {
    prefix = `/${prefix}`;
  }
  console.log({ prefix })
  if (prefix.endsWith('/')) {
    prefix = prefix.slice(0, -1);
  }

  console.log(`Registering routes for applet: ${appletName} with prefix: ${prefix || '(no prefix)'}`);

  // Register each route
  for (const route of api.routes) {
    const fullPath = prefix + route.path;

    const routeInfo = {
      path: fullPath,
      method: route.method.toUpperCase(),
      handler: route.handler,
      middleware: [
        ...(api.middleware || []),
        ...(route.middleware || [])
      ],
      applet: appletName,
      meta: api.meta || {}
    };

    appletRoutes.push(routeInfo);
    console.log(`  ${route.method.toUpperCase()} ${fullPath}`);
  }
}

/**
 * Register WebSocket handlers from an API file
 * @param {Object} api - API object from api.js file
 * @param {string} filePath - Path to the api.js file
 */
function registerWebSocketHandlers(api, filePath) {
  if (!api.websocket) {
    return; // No WebSocket configuration
  }

  const appletName = path.basename(path.dirname(filePath));
  console.log(`Registering WebSocket handlers for applet: ${appletName}`);

  if (api.websocket.register) {
    // Use custom registration function
    try {
      api.websocket.register(wsRouter);
      console.log(`  Custom WebSocket registration completed`);
    } catch (error) {
      console.error(`  Error in custom WebSocket registration: ${error.message}`);
    }
  } else if (api.websocket.path && api.websocket.handler) {
    // Simple path/handler registration
    try {
      wsRouter.addRoute(api.websocket.path, api.websocket.handler);
      console.log(`  WebSocket handler registered: ${api.websocket.path}`);
    } catch (error) {
      console.error(`  Error registering WebSocket handler: ${error.message}`);
    }
  }
}

/**
 * Load all applet routes from the applets directory
 */
async function loadAppletRoutes() {
  console.log('Loading applet routes...');
  appletRoutes = []; // Clear existing routes

  if (!fs.existsSync(appletsDirectory)) {
    console.log('Applets directory not found, skipping route loading');
    return;
  }

  const apiFiles = findApiFiles(appletsDirectory);
  console.log(`Found ${apiFiles.length} API files:`, apiFiles);

  let successCount = 0;
  let errorCount = 0;

  for (const filePath of apiFiles) {
    const api = await loadApiFile(filePath);
    if (api) {
      registerRoutes(api, filePath);
      registerWebSocketHandlers(api, filePath);
      successCount++;
    } else {
      errorCount++;
    }
  }

  console.log(`Route loading complete: ${successCount} success, ${errorCount} errors`);
  console.log(`Total routes registered: ${appletRoutes.length}`);
}

/**
 * Find matching applet route for a request
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @returns {Object|null} Matching route or null
 */
function findAppletRoute(method, url) {
  const urlParts = url.split('?')[0]; // Remove query string

  // Sort routes by specificity (most specific first)
  const sortedRoutes = [...appletRoutes].sort((a, b) => {
    // Exact matches first
    if (!a.path.includes('*') && !a.path.includes(':') && b.path.includes('*')) return -1;
    if (!b.path.includes('*') && !b.path.includes(':') && a.path.includes('*')) return 1;

    // Longer paths are more specific
    if (a.path.length !== b.path.length) {
      return b.path.length - a.path.length;
    }

    // Paths with fewer wildcards are more specific
    const aWildcards = (a.path.match(/\*/g) || []).length;
    const bWildcards = (b.path.match(/\*/g) || []).length;
    return aWildcards - bWildcards;
  });

  for (const route of sortedRoutes) {
    if (route.method === method.toUpperCase()) {
      // Simple path matching (for now - can be enhanced with parameters later)
      if (route.path === urlParts || pathMatches(route.path, urlParts)) {
        return route;
      }
    }
  }

  return null;
}

/**
 * Simple path matching with basic parameter support
 * @param {string} routePath - Route path pattern
 * @param {string} requestPath - Actual request path
 * @returns {boolean} True if paths match
 */
function pathMatches(routePath, requestPath) {
  // Handle exact matches
  if (routePath === requestPath) {
    return true;
  }

  // Handle wildcard routes (ending with /*)
  if (routePath.endsWith('/*')) {
    const baseRoute = routePath.slice(0, -2);
    return requestPath.startsWith(baseRoute);
  }

  // Handle basic parameter matching (:param)
  const routeParts = routePath.split('/');
  const requestParts = requestPath.split('/');

  if (routeParts.length !== requestParts.length) {
    return false;
  }

  for (let i = 0; i < routeParts.length; i++) {
    const routePart = routeParts[i];
    const requestPart = requestParts[i];

    // Skip parameter parts (starting with :)
    if (routePart.startsWith(':')) {
      continue;
    }

    // Exact match required for non-parameter parts
    if (routePart !== requestPart) {
      return false;
    }
  }

  return true;
}

/**
 * Extract parameters from URL based on route pattern
 * @param {string} routePath - Route path pattern
 * @param {string} requestPath - Actual request path
 * @returns {Object} Parameters object
 */
function extractParams(routePath, requestPath) {
  const params = {};
  const routeParts = routePath.split('/');
  const requestParts = requestPath.split('/');

  for (let i = 0; i < routeParts.length; i++) {
    const routePart = routeParts[i];
    const requestPart = requestParts[i];

    if (routePart.startsWith(':')) {
      const paramName = routePart.substring(1);
      params[paramName] = requestPart;
    }
  }

  return params;
}

/**
 * Parse JSON body from request with size limits
 * @param {Object} req - HTTP request object
 * @returns {Promise} Promise that resolves to parsed JSON or rejects with error
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      resolve(null);
      return;
    }

    let body = '';
    let totalSize = 0;
    const maxSize = 10 * 1024 * 1024 * 1024; // 10GB limit for file uploads

    req.on('data', chunk => {
      totalSize += chunk.length;
      
      // Check if we're exceeding the size limit
      if (totalSize > maxSize) {
        reject(new Error('Request body too large'));
        return;
      }
      
      body += chunk.toString();
    });

    req.on('end', () => {
      if (!body) {
        resolve(null);
        return;
      }

      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (error) {
        console.error('JSON parsing error:', error.message);
        console.error('Body size:', body.length, 'characters');
        reject(new Error('Invalid JSON in request body'));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Add convenience methods to the response object
 * @param {Object} res - HTTP response object
 * @param {Object} req - HTTP request object
 */
function enhanceResponse(res, req) {
  // Store original end method
  const originalEnd = res.end.bind(res);
  const originalWriteHead = res.writeHead.bind(res);
  
  let responseData = null;
  let responseHeaders = {};
  let statusCode = 200;
  
  // Override writeHead to capture headers
  res.writeHead = function(code, headers) {
    statusCode = code;
    if (headers) {
      Object.assign(responseHeaders, headers);
    }
    return this;
  };
  
  // Override end to handle compression
  res.end = function(data, encoding) {
    if (data && (typeof data === 'string' || Buffer.isBuffer(data))) {
      const contentType = responseHeaders['Content-Type'] || '';
      const acceptEncoding = req.headers['accept-encoding'] || '';
      const compression = getBestEncoding(acceptEncoding);
      
      if (compression && shouldCompress(contentType, Buffer.byteLength(data))) {
        compressResponse(data, compression, (err, compressed) => {
          if (!err && compressed) {
            responseHeaders['Content-Encoding'] = compression;
            responseHeaders['Content-Length'] = compressed.length;
            originalWriteHead(statusCode, responseHeaders);
            originalEnd(compressed);
          } else {
            // Fallback to uncompressed
            originalWriteHead(statusCode, responseHeaders);
            originalEnd(data, encoding);
          }
        });
        return;
      }
    }
    
    // No compression or not compressible
    originalWriteHead(statusCode, responseHeaders);
    originalEnd(data, encoding);
  };

  // Add json() method for easy JSON responses
  res.json = function (data, statusCode) {
    const code = statusCode || this.statusCode || 200;
    const jsonData = JSON.stringify(data);
    this.writeHead(code, { 'Content-Type': 'application/json' });
    this.end(jsonData);
  };

  // Add status() method for setting status codes
  res.status = function (statusCode) {
    this.statusCode = statusCode;
    return this;
  };

  // Add send() method for sending responses
  res.send = function (data) {
    if (typeof data === 'object') {
      this.json(data, this.statusCode || 200);
    } else {
      this.writeHead(this.statusCode || 200, { 'Content-Type': 'text/plain' });
      this.end(String(data));
    }
  };
}

/**
 * Handle applet route request
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @param {Object} route - Matching route
 */
function handleAppletRoute(req, res, route) {
  try {
    // Skip response enhancement for Server-Sent Events (SSE) endpoints
    // SSE requires direct access to the response stream
    const isSSE = req.headers.accept?.includes('text/event-stream') || 
                  route.path.includes('/stream');
    
    if (!isSSE) {
      // Enhance response object with convenience methods and compression support
      enhanceResponse(res, req);
    } else {
      // Add minimal helper methods for SSE without wrapping the response
      res.json = res.json || function(data, statusCode) {
        const code = statusCode || this.statusCode || 200;
        this.writeHead(code, { 'Content-Type': 'application/json' });
        this.end(JSON.stringify(data));
      };
      res.status = res.status || function(statusCode) {
        this.statusCode = statusCode;
        return this;
      };
      res.send = res.send || function(data) {
        if (typeof data === 'object') {
          this.json(data, this.statusCode || 200);
        } else {
          this.writeHead(this.statusCode || 200, { 'Content-Type': 'text/plain' });
          this.end(String(data));
        }
      };
    }

    // Extract parameters from URL
    req.params = extractParams(route.path, req.url.split('?')[0]);

    // Add query parameters
    const urlParts = req.url.split('?');
    if (urlParts.length > 1) {
      req.query = {};
      const queryParts = urlParts[1].split('&');
      for (const part of queryParts) {
        const [key, value] = part.split('=');
        req.query[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    } else {
      req.query = {};
    }

    // Parse JSON body for POST/PUT requests
    parseJsonBody(req)
      .then(body => {
        req.body = body;

        // Execute middleware chain
        let middlewareIndex = 0;
        const middleware = route.middleware || [];

        function next(error) {
          if (error) {
            console.error(`Middleware error in ${route.applet}:`, error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
            return;
          }

          if (middlewareIndex < middleware.length) {
            const currentMiddleware = middleware[middlewareIndex++];
            currentMiddleware(req, res, next);
          } else {
            // Execute route handler
            route.handler(req, res);
          }
        }

        // Start middleware chain
        next();
      })
      .catch(error => {
        console.error(`Error parsing request body for ${route.path}:`, error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      });

  } catch (error) {
    console.error(`Error handling applet route ${route.path}:`, error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

/**
 * Reload applet routes (for development/hot-reloading)
 */
async function reloadAppletRoutes() {
  console.log('Reloading applet routes...');
  await loadAppletRoutes();
}

async function createWebSocketServer() {
  try {
    const { wsRouter: router } = await import('./utils/websocket-router.js');
    wsRouter = router;

    console.log('WebSocket router initialized');
  } catch (error) {
    console.error('Error setting up unified WebSocket router:', error.message);
  }
}

function createServer() {
  server = http.createServer(async (req, res) => {
    // Check if this is a request to the root path
    if (req.url === '/' && req.method === 'GET') {
      // Redirect to the admin dashboard
      res.writeHead(302, { 'Location': process.env.HOME_PAGE || '/admin' });
      res.end();
      return;
    }

    // Redirect favicon requests to the view applet
    if (req.url === '/favicon.ico' && req.method === 'GET') {
      res.writeHead(302, { 'Location': '/view/favicon.png' });
      res.end();
      return;
    }

    // Serve robots.txt
    if (req.url === '/robots.txt' && req.method === 'GET') {
      const robotsPath = path.join(__dirname, 'robots.txt');
      fs.readFile(robotsPath, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(data);
      });
      return;
    }

    // Try to match applet routes
    const appletRoute = findAppletRoute(req.method, req.url);
    if (appletRoute) {
      // Handle request with applet route
      handleAppletRoute(req, res, appletRoute);
      return;
    }

    // No applet route matched - return 404
    const notFoundPath = path.join(__dirname, '404.html');
    fs.readFile(notFoundPath, 'utf8', (err, data) => {
      if (err) {
        // Fallback if 404.html is missing
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 - Not Found');
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  });
}


// Main initialization function
async function initializeServer() {
  await initializeConsole();
  await createWebSocketServer();
  await loadAppletRoutes();
  createServer();
  
  // Only initialize WebSocket router if it was successfully created
  if (wsRouter && typeof wsRouter.initialize === 'function') {
    wsRouter.initialize(server);
  }
  
  // 라즈베리파이를 위한 타임아웃 설정
  server.timeout = 60000; // 60초
  server.keepAliveTimeout = 65000; // 65초
  server.headersTimeout = 66000; // 66초
  
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Timeout settings: ${server.timeout}ms`);
  });
}

// Start the server
initializeServer().catch(console.error);

// Export functions for external use (if needed)
const getAppletRoutes = () => appletRoutes;

export {
  reloadAppletRoutes,
  loadAppletRoutes,
  getAppletRoutes
}; 
