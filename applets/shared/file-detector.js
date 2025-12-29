/**
 * File Type Detection Module
 * Determines file types and appropriate renderers
 */

import path from 'path';
import fs from 'fs';
import { FILE_TYPES_CONFIG, evaluateCondition, isVideoExtension, isImageExtension } from '../shared/file-types-config.js';


/**
 * Detect file type based on file path
 * @param {string} filePath - Path to the file
 * @returns {Object} File type information
 */
function detectFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  for (const [typeName, typeInfo] of Object.entries(FILE_TYPES_CONFIG)) {
    if (typeInfo.extensions.includes(ext)) {
      if (!evaluateCondition(typeInfo, filePath)) {
        continue;
      }
      return {
        type: typeName,
        applet: typeInfo.applet, // Which applet handles this file
        config: typeInfo.config, // Applet-specific configuration
        extension: ext,
        supported: true
      };
    }
  }
  
  return {
    type: 'unknown',
    applet: 'renderer',
    config: { renderer: 'text' },
    extension: ext,
    supported: false
  };
}

/**
 * Get file metadata
 * @param {string} filePath - Path to the file
 * @returns {Promise<Object>} File metadata
 */
async function getFileMetadata(filePath) {
  try {
    // Resolve file path relative to project root
    const resolvedPath = path.resolve(process.cwd(), filePath);
    const stats = await fs.promises.stat(resolvedPath);
    const typeInfo = detectFileType(filePath);
    
    // Determine if file is a video or image
    const ext = path.extname(filePath).toLowerCase();
    const isVideo = isVideoExtension(ext);
    const isImage = isImageExtension(ext);
    
    // Check if file is too large (> 25MB) and not a video or image
    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
    const isTooLarge = stats.size > MAX_FILE_SIZE && !isVideo && !isImage;
    
    return {
      path: filePath,
      filename: path.basename(filePath),
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isTooLarge: isTooLarge,
      ...typeInfo
    };
  } catch (error) {
    throw new Error(`Failed to get file metadata: ${error.message}`);
  }
}

/**
 * Check if file exists and is readable
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} True if file exists and is readable
 */
async function isFileAccessible(filePath) {
  try {
    // Resolve file path relative to project root
    const resolvedPath = path.resolve(process.cwd(), filePath);
    await fs.promises.access(resolvedPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate file path to prevent directory traversal
 * @param {string} filePath - Path to validate
 * @returns {boolean} True if path is safe
 */
function isPathSafe(filePath) {
  // Normalize the path and check for directory traversal attempts
  const normalizedPath = path.normalize(filePath);
  
  // Check for attempts to access parent directories
  if (normalizedPath.includes('..') || normalizedPath.startsWith('/') || normalizedPath.includes('~')) {
    return false;
  }
  
  return true;
}

/**
 * Get human-readable file size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export {
  detectFileType,
  getFileMetadata,
  isFileAccessible,
  isPathSafe,
  formatFileSize,
  FILE_TYPES_CONFIG as FILE_TYPES 
}; 