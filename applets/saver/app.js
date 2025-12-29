/**
 * Saver Applet Helper Functions
 * 
 * This module provides helper functions for file saving operations.
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
  
  // Check for empty or root path
  if (!filePath || filePath === '' || filePath === '/') {
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
 * Save file content to disk
 * @param {string} filePath - The file path to save to
 * @param {string} content - The content to save
 * @returns {Promise} - Promise that resolves when file is saved
 */
function saveFileContent(filePath, content) {
  return new Promise((resolve, reject) => {
    // Validate file path
    if (!isValidFilePath(filePath)) {
      return reject(new Error('Invalid file path'));
    }
    
    // Sanitize the path
    const sanitizedPath = sanitizeFilePath(filePath);
    
    // Ensure directory exists
    const dirPath = path.dirname(sanitizedPath);
    if (dirPath && dirPath !== '.' && dirPath !== '') {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Write file content
    fs.writeFile(sanitizedPath, content, 'utf8', (err) => {
      if (err) {
        console.error('Error saving file:', err);
        reject(err);
      } else {
        console.log(`File saved successfully: ${sanitizedPath}`);
        resolve({
          success: true,
          message: 'File saved successfully',
          filePath: sanitizedPath
        });
      }
    });
  });
}

/**
 * Validate request data for file saving
 * @param {Object} data - The request data
 * @returns {Object} - Validation result
 */
function validateSaveRequest(data) {
  const errors = [];
  
  // Check if data exists
  if (!data || typeof data !== 'object') {
    errors.push('Invalid request data');
  }
  
  // Check if content is provided
  if (!data.hasOwnProperty('content')) {
    errors.push('Content is required');
  }
  
  // Content can be empty string, so check for undefined/null only
  if (data.content === undefined || data.content === null) {
    errors.push('Content cannot be null or undefined');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors,
    data: data
  };
}

/**
 * Create standardized response object
 * @param {boolean} success - Whether operation was successful
 * @param {*} data - Response data
 * @param {string} message - Response message
 * @returns {Object} - Standardized response object
 */
function createResponse(success, data, message) {
  return {
    success: success,
    data: data,
    message: message,
    timestamp: new Date().toISOString()
  };
}

/**
 * Log activity for debugging and monitoring
 * @param {string} action - The action being performed
 * @param {Object} details - Additional details
 */
function logActivity(action, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Saver: ${action}`, details);
}

export {
  isValidFilePath,
  sanitizeFilePath,
  saveFileContent,
  validateSaveRequest,
  createResponse,
  logActivity
}; 