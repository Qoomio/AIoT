/**
 * Explorer Sub-Applet API
 * 
 * This sub-applet handles directory browsing and file tree navigation.
 * Routes:
 * - GET /_api/directory - Get directory contents
 * - POST /_api/search - Search for text across files
 * - POST /_api/replace - Replace text in files
 */

import { getDirectoryContents, createZipFromFolder } from './app.js';
import { logActivity, sendApiResponse } from '../../utils/common.js';
import { isVideoExtension, isImageExtension } from '../../../shared/file-types-config.js';

/**
 * Standard API Module Export Format
 */
const api = {
  // Metadata about this sub-applet
  meta: {
    name: 'File Explorer',
    description: 'Directory browsing, file tree navigation, and search/replace functionality',
    version: '1.1.0',
    author: 'System'
  },

  // Path prefix for all routes in this sub-applet
  prefix: '/editer/explorer',

  // Routes for directory exploration and search/replace
  routes: [
    {
      // Directory listing API - GET /editer/explorer/_api/directory
      path: '/_api/directory',
      method: 'GET',
      handler: async (req, res) => {
        try {
          // Get directory path from query parameter
          const url = new URL(req.url, `http://${req.headers.host}`);
          const dirPath = url.searchParams.get('path') || '.';
          
          logActivity('explorer', 'directory_request', { dirPath, method: req.method });
          
          // Get directory contents
          const contents = await getDirectoryContents(dirPath);
          
          logActivity('explorer', 'directory_success', { dirPath, itemCount: contents.length });
          
          // Send successful response
          sendApiResponse(res, 200, true, {
            path: dirPath,
            contents: contents
          });
          
        } catch (error) {
          logActivity('explorer', 'directory_error', { error: error.message });
          
          // Send error response
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },

    {
      // File read API - POST /editer/explorer/_api/read
      path: '/_api/read',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const { path } = req.body;
          
          if (!path) {
            return sendApiResponse(res, 400, false, null, 'File path is required');
          }
          
          logActivity('explorer', 'file_read_request', { path });
          
          // Read file content
          const fs = await import('fs/promises');
          const content = await fs.readFile(path, 'utf8');
          
          logActivity('explorer', 'file_read_success', { path, size: content.length });
          
          // Send successful response
          sendApiResponse(res, 200, true, {
            path: path,
            content: content
          });
          
        } catch (error) {
          logActivity('explorer', 'file_read_error', { error: error.message });
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
  
    {
      // Download API - POST /editer/explorer/_api/download
      path: '/_api/download',
      method: 'POST',
      handler: async (req, res) => {
        try {
          console.log('Download request received');
          console.log('Request body already parsed:', req.body);
          
          const downloadData = req.body;
          
          if (!downloadData) {
            console.log('No request body provided');
            return sendApiResponse(res, 400, false, null, 'Request body is required');
          }
          
          const { path, type } = downloadData;
          
          if (!path) {
            console.log('No path provided');
            return sendApiResponse(res, 400, false, null, 'Path is required');
          }
          
          logActivity('explorer', 'download_request', { path, type });
          console.log('Download data:', downloadData);
          
          if (type === 'folder') {
            console.log('Creating ZIP of folder:', path);
            const zipBuffer = await createZipFromFolder(path);
            console.log('ZIP created successfully, size:', zipBuffer.length);
            
            const filename = `${path.split('/').pop() || 'folder'}.zip`;
            
            logActivity('explorer', 'download_success', { path, type: 'zip', size: zipBuffer.length });
            
            // Send ZIP file
            res.writeHead(200, {
              'Content-Type': 'application/zip',
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Content-Length': zipBuffer.length
            });
            res.end(zipBuffer);
          } else {
            console.log('Unsupported download type:', type);
            return sendApiResponse(res, 400, false, null, 'Unsupported download type');
          }
          
        } catch (error) {
          console.error('Download error:', error);
          logActivity('explorer', 'download_error', { error: error.message });
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    {
      // Workspace Info API - GET /editer/explorer/_api/workspace-info
      path: '/_api/workspace-info',
      method: 'GET',
      handler: async (req, res) => {
        try {
          logActivity('explorer', 'workspace_info_request', { method: req.method });
          
          // Get the current working directory as the workspace root
          const workspaceRoot = process.cwd();
          
          logActivity('explorer', 'workspace_info_success', { workspaceRoot });
          
          // Send successful response
          sendApiResponse(res, 200, true, {
            workspaceRoot: workspaceRoot
          });
          
        } catch (error) {
          logActivity('explorer', 'workspace_info_error', { error: error.message });
          
          // Send error response
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    {
      // File Info API - POST /editer/explorer/_api/file-info
      path: '/_api/file-info',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const { path } = req.body;
          
          if (!path) {
            return sendApiResponse(res, 400, false, null, 'File path is required');
          }
          
          logActivity('explorer', 'file_info_request', { path });
          
          // Get file stats
          const fs = await import('fs/promises');
          const pathModule = await import('path');
          const stats = await fs.stat(path);
          
          // Get file extension
          const ext = pathModule.extname(path).toLowerCase();
          
          // Determine if file is a video or image
          const isVideo = isVideoExtension(ext);
          const isImage = isImageExtension(ext);
          
          // Check if file is too large (> 25MB) and not a video or image
          const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
          const isTooLarge = stats.size > MAX_FILE_SIZE && !isVideo && !isImage;
          
          logActivity('explorer', 'file_info_success', { 
            path, 
            size: stats.size, 
            isTooLarge 
          });
          
          // Send successful response
          sendApiResponse(res, 200, true, {
            path: path,
            size: stats.size,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            extension: ext,
            isVideo: isVideo,
            isImage: isImage,
            isTooLarge: isTooLarge
          });
          
        } catch (error) {
          logActivity('explorer', 'file_info_error', { error: error.message });
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    }
  ]
};

export default api;
