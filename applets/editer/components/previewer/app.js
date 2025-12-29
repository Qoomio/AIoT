/**
 * Previewer App - Main application logic
 * Coordinates with renderer applet for preview functionality
 */
import path from 'path';
import { detectFileType } from '../../../shared/file-detector.js';
import { SUPPORTED_APPLETS } from '../../../shared/file-types-config.js';

async function checkPreviewable(req, res) {
  try {
    const urlPath = req.url.replace('/editer/previewer/_api/preview/check/', '');
    const filePath = decodeURIComponent(urlPath);
    
    if (!filePath || filePath.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    const fileType = detectFileType(filePath);
    const isPreviewable = SUPPORTED_APPLETS.includes(fileType.applet);
    
    res.json({
      success: true,
      data: {
        filePath,
        isPreviewable,
        fileType: fileType.type,
        applet: fileType.applet,
        config: fileType.config,
        extension: fileType.extension,
        ...(fileType.applet === 'terminaler' && {
          requiresTerminal: true,
          terminalConfig: getTerminalConfigForFile(filePath, fileType)
        })
      }
    });
    
  } catch (error) {
    console.error('Error checking previewable:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check if file is previewable'
    });
  }
}

function getTerminalConfigForFile(filePath, fileType) {
  const fileDir = path.dirname(filePath);
  
  return {
    workingDirectory: fileDir,
    title: fileType.config?.title || 'Terminal',
    description: fileType.config?.description || 'Terminal for file development'
  };
}

export {
  checkPreviewable,
}; 