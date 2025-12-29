/**
 * Shared Utilities for Editer Sub-Applets
 * 
 * This module provides common utility functions used across all sub-applets
 * in the editer system.
 */

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
 * Log activity for debugging and monitoring
 * @param {string} source - The source component (e.g., 'editer', 'explorer', 'creater')
 * @param {string} action - The action being performed
 * @param {Object} details - Additional details
 */
function logActivity(source, action, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${source}: ${action}`, details);
}

/**
 * Get file icon based on file extension
 * @param {string} fileName - The file name
 * @param {boolean} isDirectory - Whether the item is a directory
 * @returns {string} - The icon character
 */
function getFileIcon(fileName, isDirectory) {
  if (isDirectory) {
    return '📁';
  }
  
  const ext = fileName.split('.').pop().toLowerCase();
  const iconMap = {
    'js': '📄',
    'json': '🔧',
    'html': '🌐',
    'css': '🎨',
    'md': '📝',
    'py': '🐍',
    'txt': '📄',
    'xml': '📄',
    'sql': '🗃️'
  };
  return iconMap[ext] || '📄';
}

/**
 * Get file icon CSS class based on file extension
 * @param {string} fileName - The file name
 * @param {boolean} isDirectory - Whether the item is a directory
 * @returns {string} - The CSS class name
 */
function getFileIconClass(fileName, isDirectory) {
  if (isDirectory) {
    return 'directory';
  }
  
  const ext = fileName.split('.').pop().toLowerCase();
  return ext;
}

/**
 * Create standardized API response
 * @param {boolean} success - Whether the operation was successful
 * @param {*} data - The response data
 * @param {string} error - Error message if any
 * @returns {Object} - Standardized response object
 */
function createApiResponse(success, data = null, error = null) {
  const response = { success };
  
  if (success && data !== null) {
    response.data = data;
  }
  
  if (!success && error) {
    response.error = error;
  }
  
  return response;
}

/**
 * Send standardized API response
 * @param {Object} res - HTTP response object
 * @param {number} statusCode - HTTP status code
 * @param {boolean} success - Whether the operation was successful
 * @param {*} data - The response data
 * @param {string} error - Error message if any
 */
function sendApiResponse(res, statusCode, success, data = null, error = null) {
  const response = createApiResponse(success, data, error);
  
  res.writeHead(statusCode, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(response));
}

// Re-export template utilities for convenience
import { loadTemplate, loadAppletTemplate, escapeHtml, safeEncode } from '../../shared/utils/template.js';

export {
  isValidFilePath,
  sanitizeFilePath,
  logActivity,
  getFileIcon,
  getFileIconClass,
  createApiResponse,
  sendApiResponse,
  // Template utilities
  loadTemplate,
  loadAppletTemplate,
  escapeHtml,
  safeEncode
}; 