/**
 * Viewer Applet Helper Functions
 * 
 * This module provides helper functions for file serving and viewing.
 */

import fs from 'fs';
import path from 'path';

/**
 * Validate file path to prevent directory traversal attacks
 * @param {string} filePath - The file path to validate
 * @returns {boolean} - Whether the path is valid
 */
function isValidFilePath(filePath) {
  // Check for directory traversal attempts
  if (filePath.includes('..')) {
    return false;
  }
  
  return true;
}

/**
 * Sanitize file path by removing leading slash and normalizing
 * @param {string} filePath - The file path to sanitize
 * @returns {string} - The sanitized file path
 */
function sanitizeFilePath(filePath) {
  // Remove leading slash if present
  if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }
  
  // Normalize the path
  return path.normalize(filePath);
}

/**
 * Get content type based on file extension
 * @param {string} ext - The file extension
 * @returns {string} - The content type
 */
function getContentType(ext, filePath='') {
  // Special handling for Monaco Editor CSS files when imported as modules
  if (ext.toLowerCase() === '.css' && filePath.includes('monaco-editor/esm/')) {
    // Monaco CSS files imported as ES modules should be served as JavaScript
    return 'text/javascript';
  }
  
  // Special handling for Monaco Editor contribution files without .js extension
  if (!ext && filePath.includes('monaco-editor/esm/') && 
      (filePath.includes('monaco.contribution') || 
       filePath.includes('.main') || 
       filePath.includes('editor.api'))) {
    return 'text/javascript';
  }
    
  switch (ext.toLowerCase()) {
    case '.html':
      return 'text/html';
    case '.css':
      return 'text/css';
    case '.js':
      return 'text/javascript';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.eot':
      return 'application/vnd.ms-fontobject';
    case '.txt':
      return 'text/plain';
    case '.md':
      return 'text/markdown';
    case '.xml':
      return 'application/xml';
    case '.pdf':
      return 'application/pdf';
    case '.zip':
      return 'application/zip';
    case '.ico':
      return 'image/x-icon';
    case '.webp':
      return 'image/webp';
    default:
      // Special case for Monaco codicon font files that might not have extensions
      if (filePath.includes('codicon')) {
        return 'font/ttf';
      }
      return 'text/plain';
  }
}

/**
 * Check if file exists and get stats
 * @param {string} filePath - The file path to check
 * @returns {Promise} - Promise that resolves with file stats
 */
function getFileStats(filePath) {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        resolve(stats);
      }
    });
  });
}

/**
 * Read file content from disk
 * @param {string} filePath - The file path to read
 * @returns {Promise} - Promise that resolves with file content
 */
function readFileContent(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * Serve file with appropriate headers
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @param {string} filePath - The file path to serve
 * @param {string} contentType - The content type
 * @param {Buffer} data - The file data
 */
function serveFile(req, res, filePath, contentType, data) {
  // Special handling for Monaco CSS files imported as modules
  if (contentType === 'text/javascript' && filePath.includes('monaco-editor/esm/') && filePath.endsWith('.css')) {
    // Convert CSS content to JavaScript module that injects the styles
    const cssContent = data.toString('utf8');
    
    // Escape the CSS content for JavaScript string
    const escapedCSS = cssContent
      .replace(/\\/g, '\\\\')     // Escape backslashes
      .replace(/`/g, '\\`')       // Escape backticks
      .replace(/\$/g, '\\$');     // Escape dollar signs

    // Create a JavaScript module that injects the CSS
    const jsModule = `// CSS module: ${filePath}
// Auto-injected CSS content
(function() {
  const cssId = 'monaco-css-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}';
  
  // Check if this CSS is already injected
  if (document.getElementById(cssId)) {
    return;
  }
  
  // Create and inject style element
  const style = document.createElement('style');
  style.id = cssId;
  style.type = 'text/css';
  style.textContent = \`${escapedCSS}\`;
  
  // Insert at the beginning of head to allow overrides
  const head = document.head || document.getElementsByTagName('head')[0];
  head.insertBefore(style, head.firstChild);
})();

// Export empty object to satisfy ES module requirements
export {};`;
    
    const headers = {
      'Content-Type': contentType,
      'Content-Length': Buffer.byteLength(jsModule, 'utf8')
    };
    
    // Add cache headers
    if (filePath.includes('/projects/') || filePath.startsWith('projects/')) {
      // Explicitly no-cache for user development files in projects folder
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    } else {
      headers['Cache-Control'] = 'public, max-age=86400'; // 24 hours cache
    }
    
    res.writeHead(200, headers);
    res.end(jsModule);
    return;
  }

  // Set appropriate headers
  const headers = {
    'Content-Type': contentType,
    'Content-Length': data.length
  };
  
  // Add cache headers for static assets
  if (filePath.includes('/projects/') || filePath.startsWith('projects/')) {
    // Explicitly no-cache for user development files in projects folder
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
  } else if (contentType.startsWith('image/') || 
             contentType.startsWith('font/') || 
             filePath.includes('/monaco-editor/')) {
    headers['Cache-Control'] = 'public, max-age=86400'; // 24 hours
  }
  
  res.writeHead(200, headers);
  res.end(data);
}

/**
 * Serve file stats for HEAD requests
 * @param {Object} res - HTTP response object
 * @param {string} contentType - The content type
 * @param {number} size - The file size
 */
function serveFileStats(res, contentType, size) {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': size
  });
  res.end();
}

/**
 * Handle file not found error
 * @param {Object} res - HTTP response object
 * @param {string} filePath - The file path that was not found
 */
function handleFileNotFound(res, filePath) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <html>
      <body>
        <h1>404 File Not Found</h1>
        <p>The file "${filePath}" does not exist.</p>
        <p><a href="/">Go back to home</a></p>
      </body>
    </html>
  `);
}

/**
 * Handle forbidden access error
 * @param {Object} res - HTTP response object
 * @param {string} filePath - The file path that was forbidden
 */
function handleForbiddenAccess(res, filePath) {
  res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <html>
      <body>
        <h1>403 Forbidden</h1>
        <p>Access to "${filePath}" is forbidden.</p>
        <p><a href="/">Go back to home</a></p>
      </body>
    </html>
  `);
}

/**
 * Handle internal server error
 * @param {Object} res - HTTP response object
 * @param {string} error - The error message
 */
function handleInternalError(res, error) {
  res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <html>
      <body>
        <h1>500 Internal Server Error</h1>
        <p>An error occurred while processing your request.</p>
        <p><a href="/">Go back to home</a></p>
      </body>
    </html>
  `);
}

/**
 * Log activity for debugging and monitoring
 * @param {string} action - The action being performed
 * @param {Object} details - Additional details
 */
function logActivity(action, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Viewer: ${action}`, details);
}

export {
  isValidFilePath,
  sanitizeFilePath,
  getContentType,
  getFileStats,
  readFileContent,
  serveFile,
  serveFileStats,
  handleFileNotFound,
  handleForbiddenAccess,
  handleInternalError,
  logActivity
}; 