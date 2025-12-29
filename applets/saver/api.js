/**
 * Saver Applet API
 * 
 * This applet handles file saving operations.
 * Routes:
 * - PUT /save/* - Save file content
 */

import { 
  validateSaveRequest, 
  saveFileContent, 
  createResponse, 
  logActivity 
} from './app.js';

/**
 * Standard API Module Export Format
 */
const api = {
  // Metadata about this applet
  meta: {
    name: 'File Saver',
    description: 'Handles file saving operations',
    version: '1.0.0',
    author: 'System'
  },

  // Path prefix for all routes in this applet
  prefix: '/save',

  // Routes for file saving
  routes: [
    {
      // Save file content - PUT /save/*
      path: '/*',
      method: 'PUT',
      handler: async (req, res) => {
        try {
          // Extract file path from URL
          const fullPath = req.url;
          const filePath = fullPath.replace('/save/', '');
          
          logActivity('save_request', { filePath, method: req.method });
          
          // Validate file path
          if (!filePath || filePath === '' || filePath === '/') {
            return res.status(400).json(createResponse(false, null, 'Invalid file path'));
          }
          
          // Validate request body
          const validation = validateSaveRequest(req.body);
          if (!validation.isValid) {
            logActivity('save_validation_failed', { filePath, errors: validation.errors });
            return res.status(400).json(createResponse(false, null, validation.errors.join(', ')));
          }
          
          // Try saving with original path first, then URI-decoded version if that fails
          let finalPath = filePath;
          let result;
          
          try {
            result = await saveFileContent(filePath, req.body.content);
            
          } catch (error) {
            // If save fails, try URI-decoded version
            if (error.message === 'Invalid file path') {
              try {
                const decodedPath = decodeURIComponent(filePath);
                
                // Only try decoded version if it's different from original
                if (decodedPath !== filePath) {
                  result = await saveFileContent(decodedPath, req.body.content);
                  finalPath = decodedPath;
                  logActivity('save_decoded_success', { 
                    originalPath: filePath, 
                    decodedPath: decodedPath 
                  });
                } else {
                  throw error; // Re-throw original error if paths are the same
                }
              } catch (decodeErr) {
                // If decoded version also fails, throw original error
                throw error;
              }
            } else {
              throw error; // Re-throw non-path-related errors
            }
          }
          
          logActivity('save_success', { filePath: finalPath, size: req.body.content.length });
          res.json(createResponse(true, result, 'File saved successfully'));
          
        } catch (error) {
          logActivity('save_error', { error: error.message });
          
          // Handle specific error types
          if (error.message === 'Invalid file path') {
            return res.status(403).json(createResponse(false, null, 'Forbidden: Invalid file path'));
          }
          
          res.status(500).json(createResponse(false, null, 'Failed to save file'));
        }
      }
    }
  ]
};

export default api; 