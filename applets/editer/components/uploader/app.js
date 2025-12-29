/**
 * Uploader Sub-Applet Helper Functions
 * 
 * This module provides helper functions for uploading files and folders.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { isValidFilePath, sanitizeFilePath } from '../../utils/common.js';

// In-memory storage for upload progress tracking
const uploadProgress = new Map();

/**
 * Handle single file upload
 * @param {string} fileName - The file name
 * @param {string} fileContent - The file content (base64 or text)
 * @param {string} targetPath - The target directory path
 * @returns {Promise} - Promise that resolves with upload info
 */
function handleFileUpload(fileName, fileContent, targetPath = '.') {
  return new Promise((resolve, reject) => {
    // Validate inputs
    if (!fileName || typeof fileName !== 'string') {
      return reject(new Error('Invalid file name'));
    }
    
    if (!fileContent) {
      return reject(new Error('Invalid file content'));
    }
    
    // Validate target path
    if (!isValidFilePath(targetPath)) {
      return reject(new Error('Invalid target path'));
    }
    
    // Sanitize paths
    const sanitizedTargetPath = sanitizeFilePath(targetPath);
    const filePath = path.join(sanitizedTargetPath, fileName);
    
    // Validate file path (allow forward slashes for folder structure)
    if (filePath.includes('..')) {
      return reject(new Error('Invalid file path: directory traversal not allowed'));
    }
    
    // Check if file already exists
    if (fs.existsSync(filePath)) {
      const error = new Error('File already exists');
      error.code = 'EEXIST';
      return reject(error);
    }
    
    // Create target directory and any necessary subdirectories
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) {
      try {
        fs.mkdirSync(fileDir, { recursive: true });
      } catch (mkdirError) {
        return reject(new Error(`Failed to create directory: ${mkdirError.message}`));
      }
    }
    
    // Process file content (handle base64 encoding)
    let processedContent;
    try {
      // Check if content is base64 encoded
      if (isBase64(fileContent)) {
        processedContent = Buffer.from(fileContent, 'base64');
      } else {
        processedContent = fileContent;
      }
    } catch (error) {
      return reject(new Error('Invalid file content encoding'));
    }
    
    // Write file
    fs.writeFile(filePath, processedContent, (err) => {
      if (err) {
        reject(err);
      } else {
        // Get file stats
        fs.stat(filePath, (statErr, stats) => {
          if (statErr) {
            reject(statErr);
          } else {
            resolve({
              fileName: fileName,
              filePath: filePath,
              size: stats.size,
              uploaded: stats.birthtime
            });
          }
        });
      }
    });
  });
}

/**
 * Handle multiple files upload
 * @param {Array} files - Array of file objects {fileName, fileContent}
 * @param {string} targetPath - The target directory path
 * @returns {Promise} - Promise that resolves with upload results
 */
function handleMultipleFiles(files, targetPath = '.') {
  return new Promise(async (resolve, reject) => {
    if (!Array.isArray(files)) {
      return reject(new Error('Files must be an array'));
    }
    
    // Generate upload ID for progress tracking
    const uploadId = generateUploadId();
    
    // Initialize progress tracking
    uploadProgress.set(uploadId, {
      id: uploadId,
      status: 'uploading',
      totalFiles: files.length,
      completedFiles: 0,
      errorFiles: 0,
      startTime: new Date(),
      files: []
    });
    
    const results = [];
    const errors = [];
    
    try {
      // Process files sequentially to avoid overwhelming the filesystem
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          // Update progress
          const progress = uploadProgress.get(uploadId);
          progress.currentFile = file.fileName;
          uploadProgress.set(uploadId, progress);
          
          const result = await handleFileUpload(file.fileName, file.fileContent, targetPath);
          results.push(result);
          
          // Update progress
          progress.completedFiles++;
          progress.files.push({ ...result, status: 'success' });
          uploadProgress.set(uploadId, progress);
          
        } catch (error) {
          console.error(`Upload error for file ${file.fileName}:`, error.message);
          console.error('File data:', { fileName: file.fileName, contentLength: file.fileContent ? file.fileContent.length : 0 });
          
          errors.push({
            fileName: file.fileName,
            error: error.message
          });
          
          // Update progress
          const progress = uploadProgress.get(uploadId);
          progress.errorFiles++;
          progress.files.push({ 
            fileName: file.fileName, 
            status: 'error', 
            error: error.message 
          });
          uploadProgress.set(uploadId, progress);
        }
      }
      
      // Update final progress
      const finalProgress = uploadProgress.get(uploadId);
      finalProgress.status = 'completed';
      finalProgress.endTime = new Date();
      finalProgress.duration = finalProgress.endTime - finalProgress.startTime;
      uploadProgress.set(uploadId, finalProgress);
      
      // Clean up progress after 5 minutes
      setTimeout(() => {
        uploadProgress.delete(uploadId);
      }, 5 * 60 * 1000);
      
      if (errors.length > 0) {
        console.log('errors', errors);
        const error = new Error(`Failed to upload ${errors.length} files`);
        error.details = errors;
        error.uploadId = uploadId;
        reject(error);
      } else {
        resolve(results);
      }
      
    } catch (error) {
      // Update progress on critical error
      const progress = uploadProgress.get(uploadId);
      if (progress) {
        progress.status = 'failed';
        progress.endTime = new Date();
        progress.error = error.message;
        uploadProgress.set(uploadId, progress);
      }
      
      reject(error);
    }
  });
}

/**
 * Get upload progress by ID
 * @param {string} uploadId - The upload ID
 * @returns {Promise} - Promise that resolves with progress info
 */
function getUploadProgress(uploadId) {
  return new Promise((resolve) => {
    const progress = uploadProgress.get(uploadId);
    if (progress) {
      // Calculate progress percentage
      const percentage = progress.totalFiles > 0 
        ? Math.round((progress.completedFiles / progress.totalFiles) * 100)
        : 0;
      
      resolve({
        ...progress,
        percentage
      });
    } else {
      resolve(null);
    }
  });
}

/**
 * Check if string is base64 encoded
 * @param {string} str - String to check
 * @returns {boolean} - Whether string is base64
 */
function isBase64(str) {
  if (typeof str !== 'string') return false;
  
  // Basic base64 pattern check
  const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
  
  if (!base64Pattern.test(str)) return false;
  
  // Check if length is multiple of 4
  if (str.length % 4 !== 0) return false;
  
  try {
    Buffer.from(str, 'base64');
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate unique upload ID
 * @returns {string} - Unique upload ID
 */
function generateUploadId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Validate file upload data
 * @param {Object} fileData - File data object
 * @returns {boolean} - Whether file data is valid
 */
function validateFileUploadData(fileData) {
  if (!fileData || typeof fileData !== 'object') {
    return false;
  }
  
  const { fileName, fileContent } = fileData;
  
  if (!fileName || typeof fileName !== 'string') {
    return false;
  }
  
  if (!fileContent) {
    return false;
  }
  
  // Check for potentially dangerous file names
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return false;
  }
  
  return true;
}

export {
  handleFileUpload,
  handleMultipleFiles,
  getUploadProgress,
  validateFileUploadData
}; 