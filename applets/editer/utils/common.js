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
 * @param {string} source - The source component (e.g., 'editer', 'explorer', 'creator')
 * @param {string} action - The action being performed
 * @param {Object} details - Additional details
 */
function logActivity(source, action, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${source}: ${action}`, details);
}

/**
 * Get file icon SVG based on file extension — VS Code/JetBrains style
 * @param {string} fileName - The file name
 * @param {boolean} isDirectory - Whether the item is a directory
 * @returns {string} - SVG HTML string
 */
function getFileIcon(fileName, isDirectory) {
  if (isDirectory) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">' +
           '<path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 ' +
           '1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H6.914a.5.5 0 0 1-.354-.146l-.853-.854A1.5 1.5 ' +
           '0 0 0 4.672 3H1.5z" fill="#dcb67a"/></svg>';
  }

  function doc(color, shade, label) {
    const n = label ? label.length : 0;
    const fs = n <= 1 ? 6.5 : n === 2 ? 5.2 : 4.2;
    const text = label
      ? `<text x="8" y="10" text-anchor="middle" dominant-baseline="middle" ` +
        `font-size="${fs}" font-family="'Courier New',monospace" ` +
        `font-weight="bold" fill="white" opacity="0.9">${label}</text>`
      : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">` +
           `<path d="M2 0h8l4 4v11H2z" fill="${color}"/>` +
           `<path d="M10 0l4 4h-4z" fill="${shade}"/>` +
           text + `</svg>`;
  }

  const lower = fileName.toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() : '';

  const nameMap = {
    'dockerfile': doc('#2496ed', '#0070cc', 'DF'),
    '.gitignore': doc('#f05133', '#cc2a10', 'GI'),
    '.env':       doc('#4eaa25', '#3a8018', 'EN'),
    'package.json': doc('#cbcb41', '#a8a820', 'PK'),
    'tsconfig.json': doc('#3178c6', '#1a5ca0', 'TC'),
  };
  if (nameMap[lower]) return nameMap[lower];

  const extMap = {
    'js':  doc('#cbcb41', '#a8a820', 'JS'), 'mjs': doc('#cbcb41', '#a8a820', 'JS'),
    'jsx': doc('#61dafb', '#30c0e0', 'JX'), 'ts':  doc('#3178c6', '#1a5ca0', 'TS'),
    'tsx': doc('#3178c6', '#1a5ca0', 'TX'), 'html': doc('#e34c26', '#b83018', 'HT'),
    'htm': doc('#e34c26', '#b83018', 'HT'), 'css': doc('#264de4', '#1230a0', 'CS'),
    'scss': doc('#cc6699', '#a84d7d', 'SC'), 'json': doc('#cbcb41', '#a8a820', '{}'),
    'xml': doc('#f97316', '#d45f00', 'XM'), 'yml': doc('#cb171e', '#a01015', 'YM'),
    'yaml': doc('#cb171e', '#a01015', 'YM'), 'md': doc('#519aba', '#3a7a9a', 'MD'),
    'txt': doc('#9b9b9b', '#6f6f6f', 'TX'), 'py': doc('#3572a5', '#1f5585', 'PY'),
    'sql': doc('#00758f', '#005a6e', 'SQ'), 'sh': doc('#4eaa25', '#3a8018', 'SH'),
    'rb':  doc('#cc342d', '#a02820', 'RB'), 'go': doc('#00add8', '#0088b0', 'GO'),
    'rs':  doc('#ce412b', '#a03020', 'RS'), 'php': doc('#8892bf', '#6070a0', 'PH'),
    'java': doc('#f89820', '#cc7c00', 'JV'), 'vue': doc('#41b883', '#2d9068', 'VU'),
    'c':   doc('#5c5c5c', '#3c3c3c', 'C'),  'cpp': doc('#f34b7d', '#cc2060', 'CP'),
    'cs':  doc('#178600', '#0d6000', 'C#'), 'svg': doc('#ff9900', '#cc7700', 'SG'),
  };
  const label = ext ? ext.toUpperCase().slice(0, 3) : '?';
  return extMap[ext] || doc('#858585', '#606060', label);
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