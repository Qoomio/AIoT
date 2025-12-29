/**
 * Viewer Applet API
 * 
 * This applet handles file serving and viewing functionality.
 * Routes:
 * - GET /* - Serve files from the filesystem
 * - HEAD /* - Return file headers without content
 */

import path from 'path';
import { 
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
} from './app.js';

/**
 * Standard API Module Export Format
 */
const api = {
  // Metadata about this applet
  meta: {
    name: 'File Viewer',
    description: 'Serves files from the filesystem',
    version: '1.0.0',
    author: 'System'
  },

  // Path prefix for all routes in this applet
  prefix: '/view',

  // Routes for file serving
  routes: [
    {
      // Serve files - GET /view/*
      path: '/*',
      method: 'GET',
      handler: async (req, res) => {
        try {
          // Extract file path from URL
          const fullPath = req.url;
          let filePath = fullPath.replace('/view/', '');
          
          // Default to index.html for root path
          if (filePath === '' || filePath === '/') {
            filePath = 'index.html';
          }
          
          logActivity('file_request', { filePath, method: req.method });
          
          // Validate file path
          if (!isValidFilePath(filePath)) {
            logActivity('file_forbidden', { filePath, reason: 'Invalid path' });
            handleForbiddenAccess(res, filePath);
            return;
          }
          
          // Sanitize the path
          const sanitizedPath = sanitizeFilePath(filePath);
          
          // Try to read the file with original path first, then try with .js extension for Monaco files
          let finalPath = sanitizedPath;
          let data;
          
          try {
            data = await readFileContent(sanitizedPath);
            
          } catch (err) {
            // If file not found, try with .js extension for Monaco files
            if (err.code === 'ENOENT' && filePath.includes('monaco-editor/esm/') && 
                !filePath.endsWith('.js') && !filePath.endsWith('.css')) {
              try {
                const jsPath = sanitizedPath + '.js';
                data = await readFileContent(jsPath);
                finalPath = jsPath;
                logActivity('monaco_js_extension_added', { 
                  originalPath: sanitizedPath, 
                  jsPath: jsPath 
                });
              } catch (jsErr) {
                // If .js version also fails, try URI-decoded version
                try {
                  const decodedPath = decodeURIComponent(filePath);
                  const sanitizedDecodedPath = sanitizeFilePath(decodedPath);
                  
                  // Only try decoded version if it's different from original
                  if (sanitizedDecodedPath !== sanitizedPath) {
                    data = await readFileContent(sanitizedDecodedPath);
                    finalPath = sanitizedDecodedPath;
                    logActivity('file_decoded_success', { 
                      originalPath: sanitizedPath, 
                      decodedPath: sanitizedDecodedPath 
                    });
                  } else {
                    throw err; // Re-throw original error if paths are the same
                  }
                } catch (decodeErr) {
                  // If decoded version also fails, throw original error
                  throw err;
                }
              }
            } else if (err.code === 'ENOENT') {
              // Try URI-decoded version for non-Monaco files
              try {
                const decodedPath = decodeURIComponent(filePath);
                const sanitizedDecodedPath = sanitizeFilePath(decodedPath);
                
                // Only try decoded version if it's different from original
                if (sanitizedDecodedPath !== sanitizedPath) {
                  data = await readFileContent(sanitizedDecodedPath);
                  finalPath = sanitizedDecodedPath;
                  logActivity('file_decoded_success', { 
                    originalPath: sanitizedPath, 
                    decodedPath: sanitizedDecodedPath 
                  });
                } else {
                  throw err; // Re-throw original error if paths are the same
                }
              } catch (decodeErr) {
                // If decoded version also fails, throw original error
                throw err;
              }
            } else {
              throw err; // Re-throw non-ENOENT errors
            }
          }
          
          // Determine content type using final path
          const ext = path.extname(finalPath).toLowerCase();
          const contentType = getContentType(ext, finalPath);
          
          try {
            logActivity('file_served', { 
              filePath: finalPath, 
              size: data.length, 
              contentType 
            });
            
            // Serve the file
            serveFile(req, res, finalPath, contentType, data);
            
          } catch (err) {
            logActivity('file_error', { 
              filePath: finalPath, 
              error: err.message 
            });
            
            if (err.code === 'ENOENT') {
              handleFileNotFound(res, finalPath);
            } else {
              handleInternalError(res, err.message);
            }
          }
          
        } catch (error) {
          logActivity('handler_error', { error: error.message });
          handleInternalError(res, error.message);
        }
      }
    },
    
    {
      // HEAD requests for file info - HEAD /view/*
      path: '/*',
      method: 'HEAD',
      handler: async (req, res) => {
        try {
          // Extract file path from URL
          const fullPath = req.url;
          let filePath = fullPath.replace('/view/', '');
          
          // Default to index.html for root path
          if (filePath === '' || filePath === '/') {
            filePath = 'index.html';
          }
          
          logActivity('head_request', { filePath, method: req.method });
          
          // Validate file path
          if (!isValidFilePath(filePath)) {
            logActivity('head_forbidden', { filePath, reason: 'Invalid path' });
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end();
            return;
          }
          
          // Sanitize the path
          const sanitizedPath = sanitizeFilePath(filePath);
          
          // Try to get file stats with original path first, then URI-decoded version if that fails
          let finalPath = sanitizedPath;
          let stats;
          
          try {
            stats = await getFileStats(sanitizedPath);
            
          } catch (err) {
            // If file not found, try URI-decoded version
            if (err.code === 'ENOENT') {
              try {
                const decodedPath = decodeURIComponent(filePath);
                const sanitizedDecodedPath = sanitizeFilePath(decodedPath);
                
                // Only try decoded version if it's different from original
                if (sanitizedDecodedPath !== sanitizedPath) {
                  stats = await getFileStats(sanitizedDecodedPath);
                  finalPath = sanitizedDecodedPath;
                  logActivity('head_decoded_success', { 
                    originalPath: sanitizedPath, 
                    decodedPath: sanitizedDecodedPath 
                  });
                } else {
                  throw err; // Re-throw original error if paths are the same
                }
              } catch (decodeErr) {
                // If decoded version also fails, throw original error
                throw err;
              }
            } else {
              throw err; // Re-throw non-ENOENT errors
            }
          }
          
          // Determine content type using final path
          const ext = path.extname(finalPath).toLowerCase();
          const contentType = getContentType(ext, finalPath);
          
          try {
            logActivity('head_served', { 
              filePath: finalPath, 
              size: stats.size, 
              contentType 
            });
            
            // Serve file stats
            serveFileStats(res, contentType, stats.size);
            
          } catch (err) {
            logActivity('head_error', { 
              filePath: finalPath, 
              error: err.message 
            });
            
            if (err.code === 'ENOENT') {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
            } else {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
            }
            res.end();
          }
          
        } catch (error) {
          logActivity('head_handler_error', { error: error.message });
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end();
        }
      }
    }
  ]
};

export default api; 