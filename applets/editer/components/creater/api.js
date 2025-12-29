/**
 * Creater Sub-Applet API
 * 
 * This sub-applet handles creating new files and folders.
 * Routes:
 * - POST /_api/file - Create new file
 * - POST /_api/folder - Create new folder
 * - POST /_api/template - Create from template
 * - GET /_api/templates - Get available templates
 * - DELETE /_api/file/:filePath - Delete file
 * - DELETE /_api/folder - Delete folder
 * - PATCH /_api/rename - Rename file or folder
 * - POST /_api/duplicate/file - Duplicate file
 * - POST /_api/duplicate/folder - Duplicate folder
 */

import { createFile, createFolder, createFromTemplate, getTemplatesList, deleteFile, deleteFolder, renameItem, duplicateFile, duplicateFolder } from './app.js';
import { logActivity, sendApiResponse } from '../../utils/common.js';

/**
 * Standard API Module Export Format
 */
const api = {
  // Metadata about this sub-applet
  meta: {
    name: 'File Creater',
    description: 'Create new files and folders',
    version: '1.0.0',
    author: 'System'
  },

  // Path prefix for all routes in this sub-applet
  prefix: '/edit/creater',

  // Routes for file/folder creation
  routes: [
    {
      // Create new file - POST /edit/creater/_api/file
      path: '/_api/file',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const { filePath, content = '', template } = req.body || {};
          
          if (!filePath) {
            logActivity('creater', 'file_create_error', { error: 'Missing filePath' });
            return sendApiResponse(res, 400, false, null, 'File path is required');
          }

          logActivity('creater', 'file_create_request', { filePath, hasTemplate: !!template });
          
          let result;
          if (template) {
            result = await createFromTemplate(template, filePath);
          } else {
            result = await createFile(filePath, content);
          }
          
          logActivity('creater', 'file_create_success', { filePath, size: result.size });
          
          sendApiResponse(res, 201, true, {
            filePath: result.filePath,
            size: result.size,
            created: result.created
          });
          
        } catch (error) {
          logActivity('creater', 'file_create_error', { error: error.message });
          
          if (error.code === 'EEXIST') {
            sendApiResponse(res, 409, false, null, 'File already exists');
          } else {
            sendApiResponse(res, 500, false, null, error.message);
          }
        }
      }
    },
    {
      // Create new folder - POST /edit/creater/_api/folder
      path: '/_api/folder',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const { folderPath } = req.body || {};
          
          if (!folderPath) {
            logActivity('creater', 'folder_create_error', { error: 'Missing folderPath' });
            return sendApiResponse(res, 400, false, null, 'Folder path is required');
          }

          logActivity('creater', 'folder_create_request', { folderPath });
          
          const result = await createFolder(folderPath);
          
          logActivity('creater', 'folder_create_success', { folderPath });
          
          sendApiResponse(res, 201, true, {
            folderPath: result.folderPath,
            created: result.created
          });
          
        } catch (error) {
          logActivity('creater', 'folder_create_error', { error: error.message });
          
          if (error.code === 'EEXIST') {
            sendApiResponse(res, 409, false, null, 'Folder already exists');
          } else {
            sendApiResponse(res, 500, false, null, error.message);
          }
        }
      }
    },
    {
      // Get available templates - GET /edit/creater/_api/templates
      path: '/_api/templates',
      method: 'GET',
      handler: async (req, res) => {
        try {
          logActivity('creater', 'templates_request', { method: req.method });
          
          const templates = await getTemplatesList();
          
          logActivity('creater', 'templates_success', { count: templates.length });
          
          sendApiResponse(res, 200, true, {
            templates: templates
          });
          
        } catch (error) {
          logActivity('creater', 'templates_error', { error: error.message });
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    {
      // Delete file - DELETE /edit/creater/_api/file
      path: '/_api/file/*',
      method: 'DELETE',
      handler: async (req, res) => {
        try {
          // Extract file path from URL - remove the prefix properly
          const prefix = '/edit/creater/_api/file/';
          let filePath = req.url;
          
          // Remove the prefix from the URL
          if (filePath.startsWith(prefix)) {
            filePath = filePath.substring(prefix.length);
          }
          
          filePath = decodeURIComponent(filePath);
          
          if (!filePath) {
            logActivity('creater', 'file_delete_error', { error: 'Missing filePath' });
            return sendApiResponse(res, 400, false, null, 'File path is required');
          }

          logActivity('creater', 'file_delete_request', { filePath });
          
          const result = await deleteFile(filePath);
          
          logActivity('creater', 'file_delete_success', { filePath, size: result.size });
          
          sendApiResponse(res, 200, true, {
            filePath: result.filePath,
            deleted: result.deleted,
            size: result.size
          });
          
        } catch (error) {
          logActivity('creater', 'file_delete_error', { error: error.message });
          
          if (error.code === 'ENOENT') {
            sendApiResponse(res, 404, false, null, 'File not found');
          } else if (error.code === 'EACCES') {
            sendApiResponse(res, 403, false, null, 'Permission denied');
          } else {
            sendApiResponse(res, 500, false, null, error.message);
          }
        }
      }
    },
    {
      // Delete folder - DELETE /edit/creater/_api/folder
      path: '/_api/folder',
      method: 'DELETE',
      handler: async (req, res) => {
        try {
          const { folderPath, recursive = false } = req.body || {};
          
          if (!folderPath) {
            logActivity('creater', 'folder_delete_error', { error: 'Missing folderPath' });
            return sendApiResponse(res, 400, false, null, 'Folder path is required');
          }

          logActivity('creater', 'folder_delete_request', { folderPath, recursive });
          
          const result = await deleteFolder(folderPath, recursive);
          
          logActivity('creater', 'folder_delete_success', { folderPath, recursive });
          
          sendApiResponse(res, 200, true, {
            folderPath: result.folderPath,
            deleted: result.deleted,
            recursive: result.recursive
          });
          
        } catch (error) {
          logActivity('creater', 'folder_delete_error', { error: error.message });
          
          if (error.code === 'ENOENT') {
            sendApiResponse(res, 404, false, null, 'Folder not found');
          } else if (error.code === 'ENOTEMPTY') {
            sendApiResponse(res, 400, false, null, 'Directory not empty. Use recursive option to delete non-empty directories.');
          } else if (error.code === 'EACCES') {
            sendApiResponse(res, 403, false, null, 'Permission denied');
          } else {
            sendApiResponse(res, 500, false, null, error.message);
          }
        }
      }
    },
    {
      // Rename file or folder - PATCH /edit/creater/_api/rename
      path: '/_api/rename',
      method: 'PATCH',
      handler: async (req, res) => {
        try {
          const { oldPath, newPath } = req.body || {};
          
          if (!oldPath || !newPath) {
            logActivity('creater', 'rename_error', { error: 'Missing oldPath or newPath' });
            return sendApiResponse(res, 400, false, null, 'Both oldPath and newPath are required');
          }

          logActivity('creater', 'rename_request', { oldPath, newPath });
          
          const result = await renameItem(oldPath, newPath);
          
          logActivity('creater', 'rename_success', { oldPath, newPath, isFile: result.isFile });
          
          sendApiResponse(res, 200, true, {
            oldPath: result.oldPath,
            newPath: result.newPath,
            renamed: result.renamed,
            isFile: result.isFile,
            isDirectory: result.isDirectory,
            size: result.size
          });
          
        } catch (error) {
          logActivity('creater', 'rename_error', { error: error.message });
          
          if (error.code === 'ENOENT') {
            sendApiResponse(res, 404, false, null, 'Source path not found');
          } else if (error.code === 'EEXIST') {
            sendApiResponse(res, 409, false, null, 'Destination already exists');
          } else if (error.code === 'EACCES') {
            sendApiResponse(res, 403, false, null, 'Permission denied');
          } else {
            sendApiResponse(res, 500, false, null, error.message);
          }
        }
      }
    },
    {
      // Duplicate file - POST /edit/creater/_api/duplicate/file
      path: '/_api/duplicate/file',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const { sourcePath, targetPath } = req.body || {};
          
          if (!sourcePath || !targetPath) {
            logActivity('creater', 'duplicate_file_error', { error: 'Missing sourcePath or targetPath' });
            return sendApiResponse(res, 400, false, null, 'Both sourcePath and targetPath are required');
          }

          logActivity('creater', 'duplicate_file_request', { sourcePath, targetPath });
          
          const result = await duplicateFile(sourcePath, targetPath);
          
          logActivity('creater', 'duplicate_file_success', { sourcePath, targetPath, size: result.size });
          
          sendApiResponse(res, 201, true, {
            sourcePath: result.sourcePath,
            targetPath: result.targetPath,
            duplicated: result.duplicated,
            size: result.size,
            originalSize: result.originalSize
          });
          
        } catch (error) {
          logActivity('creater', 'duplicate_file_error', { error: error.message });
          
          if (error.code === 'ENOENT') {
            sendApiResponse(res, 404, false, null, 'Source file not found');
          } else if (error.code === 'EEXIST') {
            sendApiResponse(res, 409, false, null, 'Target file already exists');
          } else if (error.code === 'EACCES') {
            sendApiResponse(res, 403, false, null, 'Permission denied');
          } else {
            sendApiResponse(res, 500, false, null, error.message);
          }
        }
      }
    },
    {
      // Duplicate folder - POST /edit/creater/_api/duplicate/folder
      path: '/_api/duplicate/folder',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const { sourcePath, targetPath } = req.body || {};
          
          if (!sourcePath || !targetPath) {
            logActivity('creater', 'duplicate_folder_error', { error: 'Missing sourcePath or targetPath' });
            return sendApiResponse(res, 400, false, null, 'Both sourcePath and targetPath are required');
          }

          logActivity('creater', 'duplicate_folder_request', { sourcePath, targetPath });
          
          const result = await duplicateFolder(sourcePath, targetPath);
          
          logActivity('creater', 'duplicate_folder_success', { sourcePath, targetPath });
          
          sendApiResponse(res, 201, true, {
            sourcePath: result.sourcePath,
            targetPath: result.targetPath,
            duplicated: result.duplicated,
            recursive: result.recursive
          });
          
        } catch (error) {
          logActivity('creater', 'duplicate_folder_error', { error: error.message });
          
          if (error.code === 'ENOENT') {
            sendApiResponse(res, 404, false, null, 'Source folder not found');
          } else if (error.code === 'EEXIST') {
            sendApiResponse(res, 409, false, null, 'Target folder already exists');
          } else if (error.code === 'EACCES') {
            sendApiResponse(res, 403, false, null, 'Permission denied');
          } else {
            sendApiResponse(res, 500, false, null, error.message);
          }
        }
      }
    }
  ]
};

export default api; 