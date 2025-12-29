/**
 * Uploader Sub-Applet API
 * 
 * This sub-applet handles file and folder uploads.
 * Routes:
 * - POST /_api/file - Upload single file
 * - POST /_api/files - Upload multiple files
 * - GET /_api/progress/:id - Get upload progress
 */

import { handleFileUpload, handleMultipleFiles, getUploadProgress } from './app.js';
import { logActivity, sendApiResponse } from '../../utils/common.js';

/**
 * Standard API Module Export Format
 */
const api = {
  // Metadata about this sub-applet
  meta: {
    name: 'File Uploader',
    description: 'Upload files and folders',
    version: '1.0.0',
    author: 'System'
  },

  // Path prefix for all routes in this sub-applet
  prefix: '/edit/uploader',

  // Routes for file uploads
  routes: [
    {
      // Upload single file - POST /edit/uploader/_api/file
      path: '/_api/file',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const { fileName, fileContent, targetPath = '.' } = req.body || {};
          
          if (!fileName || !fileContent) {
            logActivity('uploader', 'file_upload_error', { error: 'Missing fileName or fileContent' });
            return sendApiResponse(res, 400, false, null, 'File name and content are required');
          }

          logActivity('uploader', 'file_upload_request', { fileName, targetPath });
          
          const result = await handleFileUpload(fileName, fileContent, targetPath);
          
          logActivity('uploader', 'file_upload_success', { fileName, targetPath, size: result.size });
          
          sendApiResponse(res, 201, true, {
            fileName: result.fileName,
            filePath: result.filePath,
            size: result.size,
            uploaded: result.uploaded
          });
          
        } catch (error) {
          logActivity('uploader', 'file_upload_error', { error: error.message });
          
          if (error.code === 'EEXIST') {
            sendApiResponse(res, 409, false, null, 'File already exists');
          } else {
            sendApiResponse(res, 500, false, null, error.message);
          }
        }
      }
    },
    {
      // Upload multiple files - POST /edit/uploader/_api/files
      path: '/_api/files',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const { files, targetPath = '.' } = req.body || {};
          
          if (!files || !Array.isArray(files)) {
            logActivity('uploader', 'files_upload_error', { error: 'Missing files array' });
            return sendApiResponse(res, 400, false, null, 'Files array is required');
          }

          logActivity('uploader', 'files_upload_request', { fileCount: files.length, targetPath });
          
          const results = await handleMultipleFiles(files, targetPath);
          
          logActivity('uploader', 'files_upload_success', { 
            fileCount: results.length, 
            targetPath,
            totalSize: results.reduce((sum, r) => sum + r.size, 0)
          });
          
          sendApiResponse(res, 201, true, {
            uploadedFiles: results,
            totalFiles: results.length,
            totalSize: results.reduce((sum, r) => sum + r.size, 0)
          });
          
        } catch (error) {
          logActivity('uploader', 'files_upload_error', { error: error.message, details: error.details });
          
          // If we have detailed error information, include it in the response
          let errorMessage = error.message;
          if (error.details && Array.isArray(error.details)) {
            errorMessage += '. Details: ' + error.details.map(d => `${d.fileName}: ${d.error}`).join(', ');
          }
          
          sendApiResponse(res, 500, false, null, errorMessage);
        }
      }
    },
    {
      // Get upload progress - GET /edit/uploader/_api/progress/:id
      path: '/_api/progress/:id',
      method: 'GET',
      handler: async (req, res) => {
        try {
          const uploadId = req.params.id;
          
          if (!uploadId) {
            logActivity('uploader', 'progress_error', { error: 'Missing upload ID' });
            return sendApiResponse(res, 400, false, null, 'Upload ID is required');
          }

          logActivity('uploader', 'progress_request', { uploadId });
          
          const progress = await getUploadProgress(uploadId);
          
          if (!progress) {
            logActivity('uploader', 'progress_not_found', { uploadId });
            return sendApiResponse(res, 404, false, null, 'Upload not found');
          }
          
          logActivity('uploader', 'progress_success', { uploadId, status: progress.status });
          
          sendApiResponse(res, 200, true, progress);
          
        } catch (error) {
          logActivity('uploader', 'progress_error', { error: error.message });
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    }
  ]
};

export default api; 