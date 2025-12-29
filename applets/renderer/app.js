/**
 * Simplified Renderer App - Template-based approach
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  getFileMetadata, 
  isFileAccessible, 
  isPathSafe 
} from '../shared/file-detector.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Template directory
const TEMPLATES_DIR = path.join(__dirname, 'frontend');

/**
 * Handle main render route
 */
async function handleRenderRoute(req, res) {
  try {
    // Extract and validate file path
    const urlPath = req.url.replace('/render/', '');
    let filePath = urlPath;
    
    // Try original path first, then URI-decoded version if that fails
    let finalPath = filePath;
    let isAccessible = false;
    
    if (isPathSafe(filePath)) {
      isAccessible = await isFileAccessible(filePath);
    }
    
    if (!isAccessible) {
      try {
        const decodedPath = decodeURIComponent(urlPath);
        if (decodedPath !== filePath && isPathSafe(decodedPath)) {
          if (await isFileAccessible(decodedPath)) {
            finalPath = decodedPath;
            isAccessible = true;
          }
        }
      } catch (decodeError) {
        console.log('Renderer: URI decoding failed', decodeError.message);
      }
    }
    
    // Final validation
    if (!isPathSafe(finalPath) || !isAccessible) {
      return res.status(404).json({
        success: false,
        error: 'File not found or not accessible'
      });
    }
    
    // Get file metadata and type
    const metadata = await getFileMetadata(finalPath);
    
    // Check if file is too large
    if (metadata.isTooLarge) {
      const html = renderLargeFileMessage(metadata);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    
    // Load and process template
    const html = await loadTemplate(metadata);
    
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    
  } catch (error) {
    console.error('Error in render route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Render message for large files
 */
function renderLargeFileMessage(metadata) {
  const sizeInMB = (metadata.size / (1024 * 1024)).toFixed(2);
  
  try {
    // Load the large file template
    const templatePath = path.join(TEMPLATES_DIR, 'large-file.html');
    const template = fs.readFileSync(templatePath, 'utf8');
    
    // Replace placeholders
    const html = template
      .replace(/{{FILE_NAME}}/g, metadata.filename)
      .replace(/{{FILE_SIZE_MB}}/g, sizeInMB);
    
    return html;
  } catch (error) {
    console.error('Error loading large-file template:', error);
    
    // Fallback to basic message
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <title>File Too Large - ${metadata.filename}</title>
          <style>
              body { font-family: monospace; padding: 40px; text-align: center; }
              h1 { color: #e74c3c; }
          </style>
      </head>
      <body>
          <h1>File Too Large</h1>
          <p>${metadata.filename} (${sizeInMB} MB)</p>
          <p>This file exceeds the 25 MB limit and cannot be displayed.</p>
      </body>
      </html>
    `;
  }
}

/**
 * Load template and replace placeholders
 */
async function loadTemplate(metadata) {
  const { config, filename, path: filePath } = metadata;
  const renderer = config?.renderer || 'text';

  
  try {
    // Load template file
    let templatePath = path.join(TEMPLATES_DIR, `${renderer}.html`);
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(TEMPLATES_DIR, `default.html`);
    }
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Replace placeholders based on renderer type
    const placeholders = getPlaceholders(renderer, filePath, filename);
    
    let processedTemplate = templateContent;
    for (const [placeholder, value] of Object.entries(placeholders)) {
      const regex = new RegExp(`{{${placeholder}}}`, 'g');
      processedTemplate = processedTemplate.replace(regex, value);
    }
    
    return processedTemplate;
    
  } catch (error) {
    console.error(`Error loading template for ${renderer}:`, error);
    
    // Fallback to basic template
    return `
      // <!DOCTYPE html>
      <html>
      <head>
          <title>File Viewer</title>
          <style>
              body { font-family: monospace; padding: 20px; }
              pre { white-space: pre-wrap; word-wrap: break-word; }
          </style>
      </head>
      <body>
          <h2>File: ${metadata.filename}</h2>
          <p>Template not found for type: ${renderer}</p>
          <p>File path: ${filePath}</p>
      </body>
      </html>
    `;
  }
}

/**
 * Get placeholders for template replacement
 */
function getPlaceholders(renderer, filePath, filename) {
  const baseUrl = `/view/${filePath}`;

  const commonPlaceholders = {
    'FILE_NAME': filename,
    'FILE_PATH': filePath.startsWith('/') ? filePath.substring(1) : filePath  // Remove leading slash to match watcher
  };
 
  switch (renderer) {
    case 'image':
      return {
        ...commonPlaceholders,
        'IMAGE_URL': baseUrl
      };
      
    case 'video':
      return {
        ...commonPlaceholders,
        'VIDEO_URL': baseUrl
      };
      
    case 'audio':
      return {
        ...commonPlaceholders,
        'AUDIO_URL': baseUrl
      };
      
    case 'markdown':
      return {
        ...commonPlaceholders,
        'MARKDOWN_URL': baseUrl
      };
      
    case 'api':
      return {
        ...commonPlaceholders,
        'API_URL': baseUrl
      };
      
    case 'csv':
      return {
        ...commonPlaceholders,
        'CSV_URL': baseUrl
      };

    case 'json':
      return {
        ...commonPlaceholders,
        'JSON_URL': baseUrl
      };
      
    case 'pdf':
      return {
        ...commonPlaceholders,
        'PDF_URL': baseUrl
      };
      
    case 'html':
      return {
        ...commonPlaceholders,
        'HTML_URL': baseUrl
      };
      
    case 'mermaid':
      return {
        ...commonPlaceholders,
        'MERMAID_URL': baseUrl
      };

    case 'shopping':
      return {
        ...commonPlaceholders
      };
      
    default:
      return {
        ...commonPlaceholders,
        'CONTENTS': fs.readFileSync(path.join(__dirname, '../../', filePath), 'utf-8')
      };
  }
}

export {
  handleRenderRoute
};