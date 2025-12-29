/**
 * Explorer Sub-Applet API
 * 
 * This sub-applet handles directory browsing and file tree navigation.
 * Routes:
 * - GET /_api/directory - Get directory contents
 * - POST /_api/search - Search for text across files
 * - POST /_api/replace - Replace text in files
 */

import { searchInFiles, replaceInFiles } from './app.js';
import { logActivity, sendApiResponse } from '../../utils/common.js';

/**
 * Standard API Module Export Format
 */
const api = {
  // Metadata about this sub-applet
  meta: {
    name: 'File Searcher',
    description: 'Search and replace functionality',
    version: '1.1.0',
    author: 'System'
  },

  // Path prefix for all routes in this sub-applet
  prefix: '/editer/search',

  // Routes for directory exploration and search/replace
  routes: [
    {
        // Search API - POST /editer/search/_api/search
        path: '/_api/search',
        method: 'POST',
        handler: async (req, res) => {
          try {
            console.log('Search request received...')
            console.log('Parsing search data...')
            
            // Use the pre-parsed body from server middleware
            const searchData = req.body;
            
            if (!searchData) {
              return sendApiResponse(res, 400, false, null, 'Request body is required');
            }
            
            const { searchTerm, caseSensitive, wholeWord, regex, includePattern, excludePattern } = searchData;
            console.log({ searchTerm, caseSensitive, wholeWord, regex, includePattern, excludePattern })
            
            if (!searchTerm || searchTerm.trim() === '') {
              return sendApiResponse(res, 400, false, null, 'Search term is required');
            }
            
            // Set response timeout
            const timeout = setTimeout(() => {
              if (!res.headersSent) {
                sendApiResponse(res, 408, false, null, 'Search timeout - try refining your search');
              }
            }, 20000); // Slightly longer than search timeout
            
            // Handle client disconnect
            req.on('close', () => {
              clearTimeout(timeout);
              console.log('Search request cancelled by client');
            });
            
            logActivity('explorer', 'search_request', { 
              searchTerm: searchTerm.substring(0, 50), 
              caseSensitive, 
              wholeWord, 
              regex,
              includePattern,
              excludePattern
            });
            
            // Perform search with enhanced options
            const results = await searchInFiles(searchTerm, {
              caseSensitive,
              wholeWord,
              regex,
              includePattern,
              excludePattern,
              maxResults: 500, // Reduced for faster results
              maxFileSize: 512 * 1024, // 512KB
              timeout: 15000 // 15 seconds
            });
            
            clearTimeout(timeout);
            
            if (!res.headersSent) {
              logActivity('explorer', 'search_success', { 
                resultCount: results.length,
                totalMatches: results.reduce((sum, file) => sum + file.matches.length, 0)
              });
              
              sendApiResponse(res, 200, true, results);
            }
            
          } catch (error) {
            logActivity('explorer', 'search_error', { error: error.message });
            if (!res.headersSent) {
              sendApiResponse(res, 500, false, null, error.message);
            }
          }
        }
      },   {
        // Replace API - POST /editer/search/_api/replace
        path: '/_api/replace',
        method: 'POST',
        handler: async (req, res) => {
          try {
            // Use the pre-parsed body from server middleware
            const replaceData = req.body;
            
            if (!replaceData) {
              return sendApiResponse(res, 400, false, null, 'Request body is required');
            }
            
            const { replacements, replaceText } = replaceData;
            
            if (!Array.isArray(replacements) || replacements.length === 0) {
              return sendApiResponse(res, 400, false, null, 'Replacements array is required');
            }
            
            if (typeof replaceText !== 'string') {
              return sendApiResponse(res, 400, false, null, 'Replace text is required');
            }
            
            logActivity('explorer', 'replace_request', { 
              replacementCount: replacements.length,
              replaceText: replaceText.substring(0, 50)
            });
            
            // Perform replacements
            const results = await replaceInFiles(replacements, replaceText);
            
            logActivity('explorer', 'replace_success', { 
              successCount: results.successful.length,
              errorCount: results.errors.length
            });
            
            // Send successful response
            sendApiResponse(res, 200, true, results);
            
          } catch (error) {
            logActivity('explorer', 'replace_error', { error: error.message });
            sendApiResponse(res, 500, false, null, error.message);
          }
        }
      }
  ]
};

export default api;
