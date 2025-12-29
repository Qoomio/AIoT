/**
 * Creater Sub-Applet Helper Functions
 * 
 * This module provides helper functions for creating files and folders.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isValidFilePath, sanitizeFilePath } from '../../utils/common.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create a new file with content
 * @param {string} filePath - The file path to create
 * @param {string} content - The content for the file
 * @returns {Promise} - Promise that resolves with file info
 */
function createFile(filePath, content = '') {
  return new Promise((resolve, reject) => {
    // Validate file path
    if (!isValidFilePath(filePath)) {
      return reject(new Error('Invalid file path'));
    }
    
    // Sanitize the path
    const sanitizedPath = sanitizeFilePath(filePath);
    
    // Check if file already exists
    if (fs.existsSync(sanitizedPath)) {
      const error = new Error('File already exists');
      error.code = 'EEXIST';
      return reject(error);
    }
    
    // Create directory if it doesn't exist
    const dirname = path.dirname(sanitizedPath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }
    
    // Write file content
    fs.writeFile(sanitizedPath, content, 'utf8', (err) => {
      if (err) {
        reject(err);
      } else {
        // Get file stats
        fs.stat(sanitizedPath, (statErr, stats) => {
          if (statErr) {
            reject(statErr);
          } else {
            resolve({
              filePath: sanitizedPath,
              size: stats.size,
              created: stats.birthtime
            });
          }
        });
      }
    });
  });
}

/**
 * Create a new folder
 * @param {string} folderPath - The folder path to create
 * @returns {Promise} - Promise that resolves with folder info
 */
function createFolder(folderPath) {
  return new Promise((resolve, reject) => {
    // Validate folder path
    if (!isValidFilePath(folderPath)) {
      return reject(new Error('Invalid folder path'));
    }
    
    // Sanitize the path
    const sanitizedPath = sanitizeFilePath(folderPath);
    
    // Check if folder already exists
    if (fs.existsSync(sanitizedPath)) {
      const error = new Error('Folder already exists');
      error.code = 'EEXIST';
      return reject(error);
    }
    
    // Create directory
    fs.mkdir(sanitizedPath, { recursive: true }, (err) => {
      if (err) {
        reject(err);
      } else {
        // Get folder stats
        fs.stat(sanitizedPath, (statErr, stats) => {
          if (statErr) {
            reject(statErr);
          } else {
            resolve({
              folderPath: sanitizedPath,
              created: stats.birthtime
            });
          }
        });
      }
    });
  });
}

/**
 * Create file from template
 * @param {string} templateName - The template name
 * @param {string} targetPath - The target file path
 * @returns {Promise} - Promise that resolves with file info
 */
function createFromTemplate(templateName, targetPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const templates = await getTemplatesList();
      const template = templates.find(t => t.name === templateName);
      
      if (!template) {
        return reject(new Error(`Template '${templateName}' not found`));
      }
      
      // Read template content
      const templateContent = fs.readFileSync(template.path, 'utf8');
      
      // Process template variables
      const processedContent = processTemplateContent(templateContent, targetPath);
      
      // Create file with processed content
      const result = await createFile(targetPath, processedContent);
      resolve(result);
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get list of available templates
 * @returns {Promise} - Promise that resolves with templates list
 */
function getTemplatesList() {
  return new Promise((resolve, reject) => {
    const templatesDir = path.join(__dirname, 'templates');
    
    // Create templates directory if it doesn't exist
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
      
      // Create default templates
      createDefaultTemplates(templatesDir);
    }
    
    fs.readdir(templatesDir, (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      
      const templates = [];
      
      files.forEach(file => {
        const filePath = path.join(templatesDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          const ext = path.extname(file);
          const name = path.basename(file, ext);
          
          templates.push({
            name: name,
            extension: ext,
            path: filePath,
            description: getTemplateDescription(name)
          });
        }
      });
      
      resolve(templates);
    });
  });
}

/**
 * Process template content with variables
 * @param {string} content - Template content
 * @param {string} targetPath - Target file path
 * @returns {string} - Processed content
 */
function processTemplateContent(content, targetPath) {
  const fileName = path.basename(targetPath, path.extname(targetPath));
  const fileExt = path.extname(targetPath);
  const now = new Date();
  
  // Template variables
  const variables = {
    '{{FILE_NAME}}': fileName,
    '{{FILE_EXT}}': fileExt,
    '{{DATE}}': now.toISOString().split('T')[0],
    '{{TIME}}': now.toTimeString().split(' ')[0],
    '{{YEAR}}': now.getFullYear().toString(),
    '{{MONTH}}': (now.getMonth() + 1).toString().padStart(2, '0'),
    '{{DAY}}': now.getDate().toString().padStart(2, '0')
  };
  
  // Replace variables in content
  let processedContent = content;
  for (const [variable, value] of Object.entries(variables)) {
    processedContent = processedContent.replace(new RegExp(variable, 'g'), value);
  }
  
  return processedContent;
}

/**
 * Get template description
 * @param {string} templateName - Template name
 * @returns {string} - Template description
 */
function getTemplateDescription(templateName) {
  const descriptions = {
    'javascript': 'JavaScript file with basic structure',
    'html': 'HTML5 document template',
    'css': 'CSS stylesheet template',
    'json': 'JSON configuration file',
    'markdown': 'Markdown document template',
    'node-module': 'Node.js module template',
    'express-route': 'Express.js route handler',
    'react-component': 'React functional component',
    'test': 'Test file template'
  };
  
  return descriptions[templateName] || 'Custom template';
}

/**
 * Create default templates
 * @param {string} templatesDir - Templates directory path
 */
function createDefaultTemplates(templatesDir) {
  const defaultTemplates = {
    'javascript.js': `/**
 * {{FILE_NAME}}
 * 
 * Created on {{DATE}} at {{TIME}}
 */

'use strict';

// Your code here

module.exports = {};
`,
    'html.html': `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{FILE_NAME}}</title>
</head>
<body>
    <h1>{{FILE_NAME}}</h1>
    <p>Created on {{DATE}}</p>
</body>
</html>`,
    'css.css': `/**
 * {{FILE_NAME}}
 * 
 * Created on {{DATE}} at {{TIME}}
 */

/* Your styles here */

`,
    'json.json': `{
  "name": "{{FILE_NAME}}",
  "version": "1.0.0",
  "description": "",
  "created": "{{DATE}}"
}`,
    'markdown.md': `# {{FILE_NAME}}

Created on {{DATE}}

## Description

Your description here.

## Usage

Usage instructions here.
`,
    'node-module.js': `/**
 * {{FILE_NAME}} Module
 * 
 * Created on {{DATE}} at {{TIME}}
 */

'use strict';

/**
 * Module description
 */
class {{FILE_NAME}} {
  constructor() {
    // Constructor
  }
  
  // Methods here
}

module.exports = {{FILE_NAME}};
`,
    'test.test.js': `/**
 * {{FILE_NAME}} Tests
 * 
 * Created on {{DATE}} at {{TIME}}
 */

'use strict';

import assert from 'assert';

describe('{{FILE_NAME}}', function() {
  it('should work correctly', function() {
    // Test implementation
    assert.strictEqual(true, true);
  });
});
`
  };
  
  // Create default template files
  for (const [fileName, content] of Object.entries(defaultTemplates)) {
    const filePath = path.join(templatesDir, fileName);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

/**
 * Delete a file
 * @param {string} filePath - The file path to delete
 * @returns {Promise} - Promise that resolves with deletion info
 */
function deleteFile(filePath) {
  return new Promise((resolve, reject) => {
    // Validate file path
    if (!isValidFilePath(filePath)) {
      return reject(new Error('Invalid file path'));
    }
    
    // Sanitize the path
    const sanitizedPath = sanitizeFilePath(filePath);
    
    // Check if file exists
    if (!fs.existsSync(sanitizedPath)) {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      return reject(error);
    }
    
    // Check if it's actually a file (not a directory)
    const stats = fs.statSync(sanitizedPath);
    if (!stats.isFile()) {
      return reject(new Error('Path is not a file'));
    }
    
    // Delete the file
    fs.unlink(sanitizedPath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          filePath: sanitizedPath,
          deleted: new Date(),
          size: stats.size
        });
      }
    });
  });
}

/**
 * Delete a folder
 * @param {string} folderPath - The folder path to delete
 * @param {boolean} recursive - Whether to delete recursively
 * @returns {Promise} - Promise that resolves with deletion info
 */
function deleteFolder(folderPath, recursive = false) {
  return new Promise((resolve, reject) => {
    // Validate folder path
    if (!isValidFilePath(folderPath)) {
      return reject(new Error('Invalid folder path'));
    }
    
    // Sanitize the path
    const sanitizedPath = sanitizeFilePath(folderPath);
    
    // Check if folder exists
    if (!fs.existsSync(sanitizedPath)) {
      const error = new Error('Folder not found');
      error.code = 'ENOENT';
      return reject(error);
    }
    
    // Check if it's actually a directory
    const stats = fs.statSync(sanitizedPath);
    if (!stats.isDirectory()) {
      return reject(new Error('Path is not a directory'));
    }
    
    // Safety check - prevent deletion of root or important directories
    const absolutePath = path.resolve(sanitizedPath);
    const projectRoot = path.resolve(process.cwd());
    
    if (absolutePath === projectRoot || absolutePath === path.dirname(projectRoot)) {
      return reject(new Error('Cannot delete project root or parent directories'));
    }
    
    // Check if folder is empty (if not recursive)
    if (!recursive) {
      fs.readdir(sanitizedPath, (err, files) => {
        if (err) {
          return reject(err);
        }
        
        if (files.length > 0) {
          const error = new Error('Directory not empty. Use recursive option to delete non-empty directories.');
          error.code = 'ENOTEMPTY';
          return reject(error);
        }
        
        // Delete empty folder
        fs.rmdir(sanitizedPath, (rmErr) => {
          if (rmErr) {
            reject(rmErr);
          } else {
            resolve({
              folderPath: sanitizedPath,
              deleted: new Date(),
              recursive: false
            });
          }
        });
      });
    } else {
      // Recursive deletion
      fs.rm(sanitizedPath, { recursive: true, force: true }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            folderPath: sanitizedPath,
            deleted: new Date(),
            recursive: true
          });
        }
      });
    }
  });
}

/**
 * Rename a file or folder
 * @param {string} oldPath - The current path
 * @param {string} newPath - The new path
 * @returns {Promise} - Promise that resolves with rename info
 */
function renameItem(oldPath, newPath) {
  return new Promise((resolve, reject) => {
    // Validate paths
    if (!isValidFilePath(oldPath) || !isValidFilePath(newPath)) {
      return reject(new Error('Invalid file path'));
    }
    
    // Sanitize the paths
    const sanitizedOldPath = sanitizeFilePath(oldPath);
    const sanitizedNewPath = sanitizeFilePath(newPath);
    
    // Check if source exists
    if (!fs.existsSync(sanitizedOldPath)) {
      const error = new Error('Source path not found');
      error.code = 'ENOENT';
      return reject(error);
    }
    
    // Check if destination already exists
    if (fs.existsSync(sanitizedNewPath)) {
      const error = new Error('Destination already exists');
      error.code = 'EEXIST';
      return reject(error);
    }
    
    // Create destination directory if it doesn't exist
    const destDir = path.dirname(sanitizedNewPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Get source stats before rename
    const sourceStats = fs.statSync(sanitizedOldPath);
    
    // Rename the item
    fs.rename(sanitizedOldPath, sanitizedNewPath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          oldPath: sanitizedOldPath,
          newPath: sanitizedNewPath,
          renamed: new Date(),
          isFile: sourceStats.isFile(),
          isDirectory: sourceStats.isDirectory(),
          size: sourceStats.isFile() ? sourceStats.size : undefined
        });
      }
    });
  });
}

/**
 * Duplicate a file
 * @param {string} sourcePath - The source file path
 * @param {string} targetPath - The target file path
 * @returns {Promise} - Promise that resolves with duplicate info
 */
function duplicateFile(sourcePath, targetPath) {
  return new Promise((resolve, reject) => {
    // Validate paths
    if (!isValidFilePath(sourcePath) || !isValidFilePath(targetPath)) {
      return reject(new Error('Invalid file path'));
    }
    
    // Sanitize the paths
    const sanitizedSourcePath = sanitizeFilePath(sourcePath);
    const sanitizedTargetPath = sanitizeFilePath(targetPath);
    
    // Check if source exists and is a file
    if (!fs.existsSync(sanitizedSourcePath)) {
      const error = new Error('Source file not found');
      error.code = 'ENOENT';
      return reject(error);
    }
    
    const sourceStats = fs.statSync(sanitizedSourcePath);
    if (!sourceStats.isFile()) {
      return reject(new Error('Source path is not a file'));
    }
    
    // Check if target already exists
    if (fs.existsSync(sanitizedTargetPath)) {
      const error = new Error('Target file already exists');
      error.code = 'EEXIST';
      return reject(error);
    }
    
    // Create target directory if it doesn't exist
    const targetDir = path.dirname(sanitizedTargetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Copy the file
    fs.copyFile(sanitizedSourcePath, sanitizedTargetPath, (err) => {
      if (err) {
        reject(err);
      } else {
        // Get target stats
        fs.stat(sanitizedTargetPath, (statErr, targetStats) => {
          if (statErr) {
            reject(statErr);
          } else {
            resolve({
              sourcePath: sanitizedSourcePath,
              targetPath: sanitizedTargetPath,
              duplicated: new Date(),
              size: targetStats.size,
              originalSize: sourceStats.size
            });
          }
        });
      }
    });
  });
}

/**
 * Duplicate a folder recursively
 * @param {string} sourcePath - The source folder path
 * @param {string} targetPath - The target folder path
 * @returns {Promise} - Promise that resolves with duplicate info
 */
function duplicateFolder(sourcePath, targetPath) {
  return new Promise((resolve, reject) => {
    // Validate paths
    if (!isValidFilePath(sourcePath) || !isValidFilePath(targetPath)) {
      return reject(new Error('Invalid folder path'));
    }
    
    // Sanitize the paths
    const sanitizedSourcePath = sanitizeFilePath(sourcePath);
    const sanitizedTargetPath = sanitizeFilePath(targetPath);
    
    // Check if source exists and is a directory
    if (!fs.existsSync(sanitizedSourcePath)) {
      const error = new Error('Source folder not found');
      error.code = 'ENOENT';
      return reject(error);
    }
    
    const sourceStats = fs.statSync(sanitizedSourcePath);
    if (!sourceStats.isDirectory()) {
      return reject(new Error('Source path is not a directory'));
    }
    
    // Check if target already exists
    if (fs.existsSync(sanitizedTargetPath)) {
      const error = new Error('Target folder already exists');
      error.code = 'EEXIST';
      return reject(error);
    }
    
    // Recursively copy folder using fs.cp (Node.js 16+)
    if (fs.cp) {
      fs.cp(sanitizedSourcePath, sanitizedTargetPath, { recursive: true }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            sourcePath: sanitizedSourcePath,
            targetPath: sanitizedTargetPath,
            duplicated: new Date(),
            recursive: true
          });
        }
      });
    } else {
      // Fallback for older Node.js versions
      copyFolderRecursive(sanitizedSourcePath, sanitizedTargetPath)
        .then(() => {
          resolve({
            sourcePath: sanitizedSourcePath,
            targetPath: sanitizedTargetPath,
            duplicated: new Date(),
            recursive: true
          });
        })
        .catch(reject);
    }
  });
}

/**
 * Recursively copy a folder (fallback for older Node.js)
 * @param {string} source - Source folder path
 * @param {string} target - Target folder path
 * @returns {Promise} - Promise that resolves when copy is complete
 */
function copyFolderRecursive(source, target) {
  return new Promise((resolve, reject) => {
    // Create target directory
    fs.mkdir(target, { recursive: true }, (err) => {
      if (err) return reject(err);
      
      // Read source directory
      fs.readdir(source, (readErr, files) => {
        if (readErr) return reject(readErr);
        
        let pending = files.length;
        if (pending === 0) return resolve();
        
        files.forEach((file) => {
          const sourcePath = path.join(source, file);
          const targetPath = path.join(target, file);
          
          fs.stat(sourcePath, (statErr, stats) => {
            if (statErr) return reject(statErr);
            
            if (stats.isDirectory()) {
              copyFolderRecursive(sourcePath, targetPath)
                .then(() => {
                  if (--pending === 0) resolve();
                })
                .catch(reject);
            } else {
              fs.copyFile(sourcePath, targetPath, (copyErr) => {
                if (copyErr) return reject(copyErr);
                if (--pending === 0) resolve();
              });
            }
          });
        });
      });
    });
  });
}

export {
  createFile,
  createFolder,
  createFromTemplate,
  getTemplatesList,
  deleteFile,
  deleteFolder,
  renameItem,
  duplicateFile,
  duplicateFolder
}; 