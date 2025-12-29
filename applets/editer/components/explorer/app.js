/**
 * Explorer Sub-Applet Helper Functions
 * 
 * This module provides helper functions for directory browsing, file tree navigation,
 * and search/replace functionality.
 */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { isValidFilePath, sanitizeFilePath } from '../../utils/common.js';

async function createZipFromFolder(folderPath) {
  
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('data', chunk => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    
    // Add files from folder to archive
    archive.directory(folderPath, false);
    archive.finalize();
  });
}

/**
 * Get directory contents for file explorer
 * @param {string} dirPath - The directory path to list
 * @returns {Promise} - Promise that resolves with directory contents
 */
function getDirectoryContents(dirPath = '.') {
  return new Promise((resolve, reject) => {
    // Validate directory path
    if (!isValidFilePath(dirPath)) {
      return reject(new Error('Invalid directory path'));
    }
    
    // Sanitize the path
    const sanitizedPath = sanitizeFilePath(dirPath);
    
    fs.readdir(sanitizedPath, { withFileTypes: true }, (err, entries) => {
      if (err) {
        reject(err);
        return;
      }
      
      const items = [];
      const isEducationMode = process.env.NODE_ENV === 'education';
      
      entries.forEach(entry => {
        const fullPath = path.join(sanitizedPath, entry.name);
        const relativePath = path.relative('.', fullPath);
        
        // Skip hidden files and directories
        if (entry.name.startsWith('.')) {
          return;
        }
        
        // In education mode, at root level, only show the projects folder
        if (isEducationMode && (sanitizedPath === '.' || sanitizedPath === '')) {
          if (entry.name !== 'projects') {
            return;
          }
        }
        
        items.push({
          name: entry.name,
          path: relativePath,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile()
        });
      });
      
      // Sort directories first, then files
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      
      resolve(items);
    });
  });
}

/**
 * Get all files recursively from a directory
 * @param {string} dirPath - Directory to scan
 * @param {object} options - Filtering options
 * @returns {Promise<string[]>} - Array of file paths
 */
function getAllFiles(dirPath = '.', options = {}) {
  return new Promise((resolve, reject) => {
    const files = [];
    const { includePattern = '', excludePattern = '' } = options;
    
    // Parse include/exclude patterns
    const includeGlobs = includePattern.split(',').map(p => p.trim()).filter(Boolean);
    const excludeGlobs = excludePattern.split(',').map(p => p.trim()).filter(Boolean);
    
    function walkDirectory(currentPath) {
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          // Skip hidden files and directories
          if (entry.name.startsWith('.')) continue;
          
          const fullPath = path.join(currentPath, entry.name);
          const relativePath = path.relative('.', fullPath);
          
          if (entry.isDirectory()) {
            // Skip common exclude directories
            if (['node_modules', '.git', 'dist', 'build', '.vscode'].includes(entry.name)) {
              continue;
            }
            
            // Check exclude patterns for directories
            if (excludeGlobs.some(pattern => matchesPattern(relativePath, pattern))) {
              continue;
            }
            
            // Recursively walk subdirectory
            walkDirectory(fullPath);
          } else if (entry.isFile()) {
            // Check exclude patterns
            if (excludeGlobs.some(pattern => matchesPattern(relativePath, pattern))) {
              continue;
            }
            
            // Check include patterns (if specified)
            if (includeGlobs.length > 0) {
              if (!includeGlobs.some(pattern => matchesPattern(relativePath, pattern))) {
                continue;
              }
            }
            
            files.push(relativePath);
          }
        }
      } catch (error) {
        // Continue if we can't read a directory
        console.warn(`Warning: Could not read directory ${currentPath}:`, error.message);
      }
    }
    
    try {
      walkDirectory(sanitizeFilePath(dirPath));
      resolve(files);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Simple pattern matching for file paths
 * @param {string} filePath - File path to test
 * @param {string} pattern - Pattern to match (supports * wildcard)
 * @returns {boolean} - Whether the path matches the pattern
 */
function matchesPattern(filePath, pattern) {
  if (!pattern) return false;
  
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
    .replace(/\./g, '\\.');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filePath) || regex.test(path.basename(filePath));
}

export {
  getDirectoryContents,
  getAllFiles,
  createZipFromFolder
};