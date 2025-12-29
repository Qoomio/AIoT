/**
 * Editer Applet API
 * 
 * This applet handles Monaco editor functionality for file editing.
 * Routes:
 * - GET /edit/* - Serve Monaco editor page for file editing
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { 
  readFileContent, 
  findFirstFile
} from './app.js';
import { isValidFilePath, sanitizeFilePath, logActivity } from './utils/common.js';

// Change this function at the top:
function getRedirectUrl(filePath, originalUrl) {
  const url = new URL(originalUrl, 'http://localhost');
  const queryString = url.search; // Gets ?param=value
  return `/edit/${filePath}${queryString}`;
}

/**
 * Standard API Module Export Format
 */
const api = {
  // Metadata about this applet
  meta: {
    name: 'File Editor',
    description: 'Monaco editor interface for file editing',
    version: '1.0.0',
    author: 'System'
  },

  // Path prefix for all routes in this applet
  prefix: '/edit',

  // Routes for file editing
  routes: [
    {
      // Monaco editor page - GET /edit/*
      path: '/*',
      method: 'GET',
      handler: async (req, res) => {
        try {
          if (req.url.endsWith('codicon.ttf')) {
            const fontPath = '/view/applets/editer/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.ttf';
            res.writeHead(302, { 'Location': fontPath });
            res.end();
            return;
          }
          // Extract file path from URL
          const fullPath = req.url;;
          const pathWithoutQuery = fullPath.split('?')[0]; // Remove query string
          const filePath = pathWithoutQuery.replace('/edit/', '').toLowerCase();
          
          logActivity('editer', 'edit_request', { filePath, method: req.method });
          
          // Validate file path
          if (filePath === '/edit' || filePath === '/edit/' || filePath === '') {
            // Redirect to first file for root path
            try {
              const firstFile = await findFirstFile();
              res.writeHead(302, { 'Location': `/edit/${firstFile}` });
              return res.end();
            } catch (err) {
              logActivity('editer', 'find_first_file_error', { error: err.message });
              // Fallback to server.js if findFirstFile fails
              res.writeHead(302, { 'Location': '/edit/server.js' });
              return res.end();
            }
          }
          
          // Validate and sanitize path
          if (!isValidFilePath(filePath)) {
            logActivity('editer', 'edit_forbidden', { filePath, reason: 'Invalid path' });
            try {
              const firstFile = await findFirstFile();
              res.writeHead(302, { 'Location': `/edit/${firstFile}` });
              return res.end();
            } catch (err) {
              logActivity('editer', 'find_first_file_error', { error: err.message });
              res.writeHead(302, { 'Location': '/edit/server.js' });
              return res.end();
            }
          }
          
          try {
            const html = fs.readFileSync(path.join(__dirname, 'frontend', 'editer.html'), 'utf8');
            
            // Inject configuration into HTML
            const nodeEnv = process.env.NODE_ENV || 'development';
            const hideAiPane = process.env.HIDE_AI_PANE === 'true';
            const htmlWithConfig = html.replace(
              '</head>',
              `<script>window.__QOOM_CONFIG = { NODE_ENV: '${nodeEnv}', HIDE_AI_PANE: ${hideAiPane} };</script></head>`
            );
            
            logActivity('editer', 'edit_success', { filePath });
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlWithConfig);
            
          } catch (err) {
            logActivity('editer', 'edit_error', { filePath, error: err.message });
            
            // For any error (404, 500, etc.), redirect to the first file
            try {
              const firstFile = await findFirstFile();
              res.writeHead(302, { 'Location': `/edit/${firstFile}` });
              return res.end();
            } catch (findErr) {
              logActivity('editer', 'find_first_file_error', { error: findErr.message });
              res.writeHead(302, { 'Location': '/edit/server.js' });
              return res.end();
            }
          }
          
        } catch (error) {
          logActivity('editer', 'edit_handler_error', { error: error.message });
          
          // For any handler error, redirect to the first file
          try {
            const firstFile = await findFirstFile();
            res.writeHead(302, { 'Location': `/edit/${firstFile}` });
            return res.end();
          } catch (findErr) {
            logActivity('editer', 'find_first_file_error', { error: findErr.message });
            res.writeHead(302, { 'Location': '/edit/server.js' });
            return res.end();
          }
        }
      }
    },
    {
      // HEAD support for /edit/*
      path: '/*',
      method: 'HEAD',
      handler: async (req, res) => {
        // For HEAD requests, just return basic headers without body
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end();
      }
    }
  ]
};

export default api; 