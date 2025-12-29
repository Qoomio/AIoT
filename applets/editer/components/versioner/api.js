/**
 * Versioner Applet API
 * 
 * This applet handles file versioning functionality.
 */

 import fs from 'fs';
 import path from 'path';
 import { fileURLToPath } from 'url';
 
 // Get __dirname equivalent in ES modules
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = path.dirname(__filename);
 
 import {
     createVersion,
     listVersions,
     getVersionContent,
     cleanupVersions,
     getVersionStats,
     isValidFilePath
 } from './app.js';
 
 /**
  * Create standard API response
  * @param {boolean} success - Success status
  * @param {any} data - Response data
  * @param {string} message - Response message
  * @returns {object} Formatted response
  */
 function createResponse(success, data = null, message = '') {
     return {
         success,
         data,
         message,
         timestamp: new Date().toISOString()
     };
 }
 
 /**
  * Standard API Module Export Format
  */
 const api = {
     // Metadata about this applet
     meta: {
         name: 'File Versioner',
         description: 'File version management and history tracking',
         version: '1.0.0',
         author: 'System'
     },
 
     // Path prefix for all routes in this applet
     prefix: '/versions',
 
     // Routes for version management
     routes: [
         {
             // Get version history for a file - GET /versions/history/*
             path: '/history/*',
             method: 'GET',
             handler: async (req, res) => {
                 try {
                     const filePath = req.url.replace('/versions/history/', '');
                     
                     if (!filePath || !isValidFilePath(filePath)) {
                         res.writeHead(400, { 'Content-Type': 'application/json' });
                         res.end(JSON.stringify(createResponse(false, null, 'Invalid file path')));
                         return;
                     }
                     
                     const versions = await listVersions(filePath);
                     
                     res.writeHead(200, { 'Content-Type': 'application/json' });
                     res.end(JSON.stringify(createResponse(true, versions, 'Version history retrieved successfully')));
                     
                 } catch (error) {
                     console.error('Error getting version history:', error);
                     res.writeHead(500, { 'Content-Type': 'application/json' });
                     res.end(JSON.stringify(createResponse(false, null, 'Failed to get version history')));
                 }
             }
         },
         {
             // Get specific version content - GET /versions/content/{filePath}/{timestamp}
             path: '/content/*',
             method: 'GET',
             handler: async (req, res) => {
                 try {
                     const urlParts = req.url.replace('/versions/content/', '').split('/');
                     if (urlParts.length < 2) {
                         res.writeHead(400, { 'Content-Type': 'application/json' });
                         res.end(JSON.stringify(createResponse(false, null, 'Invalid request format')));
                         return;
                     }
                     
                     const timestamp = urlParts.pop();
                     const filePath = urlParts.join('/');
                     
                     if (!filePath || !isValidFilePath(filePath) || !timestamp) {
                         res.writeHead(400, { 'Content-Type': 'application/json' });
                         res.end(JSON.stringify(createResponse(false, null, 'Invalid file path or timestamp')));
                         return;
                     }
                     
                     const content = await getVersionContent(filePath, parseInt(timestamp));
                     
                     res.writeHead(200, { 'Content-Type': 'application/json' });
                     res.end(JSON.stringify(createResponse(true, { content }, 'Version content retrieved successfully')));
                     
                 } catch (error) {
                     console.error('Error getting version content:', error);
                     res.writeHead(404, { 'Content-Type': 'application/json' });
                     res.end(JSON.stringify(createResponse(false, null, 'Version not found')));
                 }
             }
         },
                 {
            // Create new version - POST /versions/create/*
            path: '/create/*',
            method: 'POST',
            handler: async (req, res) => {
                try {
                    const filePath = req.url.replace('/versions/create/', '');
                    
                    if (!filePath || !isValidFilePath(filePath)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(createResponse(false, null, 'Invalid file path')));
                        return;
                    }
                    
                    // Get parsed body from server.js
                    const body = req.body;
                    if (!body || typeof body !== 'object') {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(createResponse(false, null, 'Invalid request body')));
                        return;
                    }
                    
                    const { content } = body;
                    
                    if (typeof content !== 'string') {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(createResponse(false, null, 'Content must be a string')));
                        return;
                    }
                    
                    const versionInfo = await createVersion(filePath, content);
                    
                    // Auto-cleanup old versions (keep last 50)
                    await cleanupVersions(filePath, 50);
                    
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(createResponse(true, versionInfo, 'Version created successfully')));
                    
                } catch (error) {
                    console.error('Error creating version:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(createResponse(false, null, 'Failed to create version')));
                }
            }
        },
         {
             // Rollback to specific version - POST /versions/rollback/{filePath}/{timestamp}
             path: '/rollback/*',
             method: 'POST',
             handler: async (req, res) => {
                 try {
                     const urlParts = req.url.replace('/versions/rollback/', '').split('/');
                     if (urlParts.length < 2) {
                         res.writeHead(400, { 'Content-Type': 'application/json' });
                         res.end(JSON.stringify(createResponse(false, null, 'Invalid request format')));
                         return;
                     }
                     
                     const timestamp = urlParts.pop();
                     const filePath = urlParts.join('/');
                     
                     if (!filePath || !isValidFilePath(filePath) || !timestamp) {
                         res.writeHead(400, { 'Content-Type': 'application/json' });
                         res.end(JSON.stringify(createResponse(false, null, 'Invalid file path or timestamp')));
                         return;
                     }
                     
                     // Get version content
                     const versionContent = await getVersionContent(filePath, parseInt(timestamp));
                     
                     // Create backup of current version before rollback
                     try {
                         const currentContent = await fs.promises.readFile(filePath, 'utf8');
                         await createVersion(filePath, currentContent);
                     } catch (readError) {
                         // If file doesn't exist, that's okay - we're rolling back to create it
                         console.log('Current file not found, proceeding with rollback');
                     }
                     
                     // Write the version content to the original file
                     const fullPath = path.resolve(filePath);
                     const dir = path.dirname(fullPath);
                     
                     // Ensure directory exists
                     await fs.promises.mkdir(dir, { recursive: true });
                     await fs.promises.writeFile(fullPath, versionContent, 'utf8');
                     
                     res.writeHead(200, { 'Content-Type': 'application/json' });
                     res.end(JSON.stringify(createResponse(true, { 
                         filePath, 
                         timestamp: parseInt(timestamp),
                         size: versionContent.length 
                     }, 'File rolled back successfully')));
                     
                 } catch (error) {
                     console.error('Error rolling back version:', error);
                     res.writeHead(500, { 'Content-Type': 'application/json' });
                     res.end(JSON.stringify(createResponse(false, null, 'Failed to rollback file')));
                 }
             }
         },
         {
             // Cleanup old versions - DELETE /versions/cleanup/*
             path: '/cleanup/*',
             method: 'DELETE',
             handler: async (req, res) => {
                 try {
                     const filePath = req.url.replace('/versions/cleanup/', '');
                     
                     if (!filePath || !isValidFilePath(filePath)) {
                         res.writeHead(400, { 'Content-Type': 'application/json' });
                         res.end(JSON.stringify(createResponse(false, null, 'Invalid file path')));
                         return;
                     }
                     
                     // Parse query parameters for keep count
                     const url = new URL(req.url, 'http://localhost');
                     const keepCount = parseInt(url.searchParams.get('keep')) || 50;
                     
                     const result = await cleanupVersions(filePath, keepCount);
                     
                     res.writeHead(200, { 'Content-Type': 'application/json' });
                     res.end(JSON.stringify(createResponse(true, result, 'Cleanup completed')));
                     
                 } catch (error) {
                     console.error('Error cleaning up versions:', error);
                     res.writeHead(500, { 'Content-Type': 'application/json' });
                     res.end(JSON.stringify(createResponse(false, null, 'Failed to cleanup versions')));
                 }
             }
         },
         {
             // Get version storage statistics - GET /versions/stats
             path: '/stats',
             method: 'GET',
             handler: async (req, res) => {
                 try {
                     const stats = await getVersionStats();
                     
                     res.writeHead(200, { 'Content-Type': 'application/json' });
                     res.end(JSON.stringify(createResponse(true, stats, 'Statistics retrieved successfully')));
                     
                 } catch (error) {
                     console.error('Error getting version stats:', error);
                     res.writeHead(500, { 'Content-Type': 'application/json' });
                     res.end(JSON.stringify(createResponse(false, null, 'Failed to get statistics')));
                 }
             }
         }
     ]
 };
 
 export default api;