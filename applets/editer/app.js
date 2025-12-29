/**
 * Editer Applet Helper Functions
 * 
 * This module provides helper functions for the Monaco Editor interface.
 * Now using external templates instead of inline HTML to avoid template literal issues.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { safeEncode, isValidFilePath, sanitizeFilePath } from './utils/common.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


function loadTemplate(templatePath, variables = {}) {
    try {
        // Read the template file
        const fullPath = path.join(__dirname, 'frontend', templatePath);
        const template = fs.readFileSync(fullPath, 'utf8');
        
        // Replace variables using {{variable}} syntax
        let processedHtml = template;
        
        for (const [key, value] of Object.entries(variables)) {
            // Handle different types of values
            let replacement = '';
            if (typeof value === 'string') {
                replacement = value;
            } else if (typeof value === 'object') {
                replacement = JSON.stringify(value);
            } else {
                replacement = String(value);
            }
            
            // Replace all occurrences of {{key}} with value
            const regex = new RegExp(`{{${key}}}`, 'g');
            processedHtml = processedHtml.replace(regex, replacement);
        }
        
        return processedHtml;
    } catch (error) {
        console.error('Error loading template:', templatePath, error);
        return `<html><body><h1>Template Error</h1><p>Could not load template: ${templatePath}</p></body></html>`;
    }
}
/**
 * Find the first file to use as default, prioritizing Python and JavaScript files in projects folder
 * @returns {Promise<string>} - Promise that resolves with the first file path
 */
async function findFirstFile() {
  const priorityExtensions = ['.py', '.js'];
  
  /**
   * Recursively search a directory for files with priority extensions
   */
  async function searchDirectory(dirPath, relativePath = '') {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const results = { priority: [], other: [] };
      
      for (const entry of entries) {
        // Skip hidden files/directories
        if (entry.name.startsWith('.')) continue;
        
        const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (priorityExtensions.includes(ext)) {
            results.priority.push(entryRelativePath);
          } else {
            results.other.push(entryRelativePath);
          }
        } else if (entry.isDirectory()) {
          // Recursively search subdirectories (but not too deep)
          if (relativePath.split('/').length < 3) {
            const subResults = await searchDirectory(path.join(dirPath, entry.name), entryRelativePath);
            results.priority.push(...subResults.priority);
            results.other.push(...subResults.other);
          }
        }
      }
      
      return results;
    } catch (err) {
      return { priority: [], other: [] };
    }
  }
  
  // First, try to find files in the projects folder
  const projectsPath = path.join('.', 'projects');
  try {
    const projectsStats = await fs.promises.stat(projectsPath);
    if (projectsStats.isDirectory()) {
      const projectResults = await searchDirectory(projectsPath, 'projects');
      
      // Return first priority file from projects
      if (projectResults.priority.length > 0) {
        projectResults.priority.sort();
        return projectResults.priority[0];
      }
      
      // Return first other file from projects
      if (projectResults.other.length > 0) {
        projectResults.other.sort();
        return projectResults.other[0];
      }
    }
  } catch (err) {
    // Projects folder doesn't exist, continue to root
  }
  
  // Fallback: search root directory
  const rootResults = await searchDirectory('.');
  
  // Return first priority file from root
  if (rootResults.priority.length > 0) {
    rootResults.priority.sort();
    return rootResults.priority[0];
  }
  
  // Return first other file from root
  if (rootResults.other.length > 0) {
    rootResults.other.sort();
    return rootResults.other[0];
  }
  
  throw new Error('No files found');
}

/**
 * Read file content from disk
 * @param {string} filePath - The file path to read
 * @returns {Promise} - Promise that resolves with file content
 */
function readFileContent(filePath) {
  return new Promise((resolve, reject) => {
    // Validate file path
    if (!isValidFilePath(filePath)) {
      return reject(new Error('Invalid file path'));
    }
    
    // Sanitize the path
    const sanitizedPath = sanitizeFilePath(filePath);
    
    // Read file content
    fs.readFile(sanitizedPath, 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}


export {
    readFileContent,
    findFirstFile,
}; 