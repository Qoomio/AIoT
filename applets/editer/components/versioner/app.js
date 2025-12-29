/**
 * Versioner Applet Helper Functions
 * 
 * This module provides version management functionality for file editing.
 * Handles creating, listing, and retrieving file versions.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Version storage directory
const VERSIONS_DIR = path.join(__dirname, '.versions');

/**
 * Ensure versions directory exists
 */
function ensureVersionsDir() {
    if (!fs.existsSync(VERSIONS_DIR)) {
        fs.mkdirSync(VERSIONS_DIR, { recursive: true });
    }
}

/**
 * Generate version filename with timestamp
 * @param {string} originalPath - Original file path
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Version filename
 */
function generateVersionFilename(originalPath, timestamp = Date.now()) {
    const safePath = originalPath.replace(/\.\./g, '_');
    const ext = path.extname(safePath);
    const nameWithoutExt = safePath.slice(0, -ext.length);
    return `${nameWithoutExt}.${timestamp}${ext}`;
}


/**
 * Parse version filename to extract original path and timestamp
 * @param {string} versionFilename - Version filename
 * @returns {object} Parsed information
 */
function parseVersionFilename(versionFilename) {
    const ext = path.extname(versionFilename);
    const nameWithoutExt = versionFilename.slice(0, -ext.length);
    const match = nameWithoutExt.match(/^(.+)\.(\d+)$/);
    
    if (!match) return null;
    
    const [, basePath, timestamp] = match;
    return {
        basePath,
        timestamp: parseInt(timestamp),
        extension: ext,
        date: new Date(parseInt(timestamp)),
        originalPath: basePath + ext
    };
}

/**
 * Create a new version of a file
 * @param {string} filePath - Original file path
 * @param {string} content - File content
 * @returns {Promise<object>} Version info
 */
async function createVersion(filePath, content) {
    ensureVersionsDir();
    
    const timestamp = Date.now();
    const versionFilename = generateVersionFilename(filePath, timestamp);
    const versionPath = path.join(VERSIONS_DIR, versionFilename);
    
    try {
        // Ensure the directory structure exists in .versions
        const versionDir = path.dirname(versionPath);
        await fs.promises.mkdir(versionDir, { recursive: true });
        
        await fs.promises.writeFile(versionPath, content, 'utf8');
        
        const stats = await fs.promises.stat(versionPath);
        
        return {
            success: true,
            filename: versionFilename,
            timestamp,
            date: new Date(timestamp).toISOString(),
            size: stats.size,
            originalPath: filePath
        };
    } catch (error) {
        console.error('Error creating version:', error);
        throw new Error(`Failed to create version: ${error.message}`);
    }
}

/**
 * List all versions of a file
 * @param {string} filePath - Original file path
 * @returns {Promise<Array>} List of versions
 */
async function listVersions(filePath) {
    ensureVersionsDir();
    
    try {
        const safePath = filePath.replace(/\.\./g, '_');
        const ext = path.extname(safePath);
        const nameWithoutExt = safePath.slice(0, -ext.length);
        
        // Build the directory path where versions would be stored
        const versionDir = path.join(VERSIONS_DIR, path.dirname(safePath));
        
        // Check if the version directory exists
        if (!fs.existsSync(versionDir)) {
            return []; // No versions exist yet
        }
        
        const files = await fs.promises.readdir(versionDir);
        
        // Filter files that match this file path
        const versionFiles = files.filter(file => {
            const parsed = parseVersionFilename(path.join(path.dirname(safePath), file));
            return parsed && parsed.originalPath === safePath;
        });
        
        // Get file stats and sort by timestamp (newest first)
        const versions = await Promise.all(
            versionFiles.map(async (file) => {
                const versionPath = path.join(versionDir, file);
                const stats = await fs.promises.stat(versionPath);
                const fullVersionPath = path.join(path.dirname(safePath), file);
                const parsed = parseVersionFilename(fullVersionPath);
                
                return {
                    filename: fullVersionPath,
                    timestamp: parsed.timestamp,
                    date: parsed.date.toISOString(),
                    size: stats.size,
                    originalPath: filePath,
                    created: stats.ctime.toISOString(),
                    modified: stats.mtime.toISOString()
                };
            })
        );
        
        // Sort by timestamp, newest first
        return versions.sort((a, b) => b.timestamp - a.timestamp);
        
    } catch (error) {
        console.error('Error listing versions:', error);
        throw new Error(`Failed to list versions: ${error.message}`);
    }
}

/**
 * Get content of a specific version
 * @param {string} filePath - Original file path
 * @param {number} timestamp - Version timestamp
 * @returns {Promise<string>} Version content
 */
async function getVersionContent(filePath, timestamp) {
    ensureVersionsDir();
    
    try {
        const versionFilename = generateVersionFilename(filePath, timestamp);
        const versionPath = path.join(VERSIONS_DIR, versionFilename);
        
        if (!fs.existsSync(versionPath)) {
            throw new Error('Version not found');
        }
        
        const content = await fs.promises.readFile(versionPath, 'utf8');
        return content;
        
    } catch (error) {
        console.error('Error getting version content:', error);
        throw new Error(`Failed to get version content: ${error.message}`);
    }
}

/**
 * Delete old versions, keeping only the specified number
 * @param {string} filePath - Original file path
 * @param {number} keepCount - Number of versions to keep
 * @returns {Promise<object>} Cleanup result
 */
async function cleanupVersions(filePath, keepCount = 50) {
    try {
        const versions = await listVersions(filePath);
        
        if (versions.length <= keepCount) {
            return {
                success: true,
                deleted: 0,
                kept: versions.length,
                message: 'No cleanup needed'
            };
        }
        
        // Delete oldest versions
        const toDelete = versions.slice(keepCount);
        let deletedCount = 0;
        
        for (const version of toDelete) {
            try {
                const versionPath = path.join(VERSIONS_DIR, version.filename);
                await fs.promises.unlink(versionPath);
                deletedCount++;
            } catch (error) {
                console.error(`Error deleting version ${version.filename}:`, error);
            }
        }
        
        return {
            success: true,
            deleted: deletedCount,
            kept: versions.length - deletedCount,
            message: `Cleaned up ${deletedCount} old versions`
        };
        
    } catch (error) {
        console.error('Error cleaning up versions:', error);
        throw new Error(`Failed to cleanup versions: ${error.message}`);
    }
}

/**
 * Get statistics about version storage
 * @returns {Promise<object>} Storage statistics
 */
async function getVersionStats() {
    ensureVersionsDir();
    
    try {
        let totalSize = 0;
        let fileCount = 0;
        const fileGroups = {};
        
        // Recursively walk through the versions directory
        async function walkDirectory(dir) {
            const files = await fs.promises.readdir(dir);
            
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stats = await fs.promises.stat(fullPath);
                
                if (stats.isDirectory()) {
                    await walkDirectory(fullPath);
                } else {
                    // Get relative path from versions directory
                    const relativePath = path.relative(VERSIONS_DIR, fullPath);
                    const parsed = parseVersionFilename(relativePath);
                    
                    if (parsed) {
                        totalSize += stats.size;
                        fileCount++;
                        
                        const key = parsed.originalPath;
                        if (!fileGroups[key]) {
                            fileGroups[key] = { count: 0, size: 0 };
                        }
                        fileGroups[key].count++;
                        fileGroups[key].size += stats.size;
                    }
                }
            }
        }
        
        await walkDirectory(VERSIONS_DIR);
        
        return {
            totalVersions: fileCount,
            totalSize,
            totalSizeFormatted: formatBytes(totalSize),
            uniqueFiles: Object.keys(fileGroups).length,
            fileGroups
        };
        
    } catch (error) {
        console.error('Error getting version stats:', error);
        throw new Error(`Failed to get version stats: ${error.message}`);
    }
}

/**
 * Format bytes to human readable format
 * @param {number} bytes - Bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate file path for security
 * @param {string} filePath - File path to validate
 * @returns {boolean} Is valid
 */
function isValidFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    
    // Prevent path traversal attacks
    if (filePath.includes('..') || filePath.includes('\\') || filePath.startsWith('/')) {
        return false;
    }
    
    // Check for valid characters (basic validation)
    const validPattern = /^[a-zA-Z0-9._\-\/]+$/;
    return validPattern.test(filePath);
}

export {
    createVersion,
    listVersions,
    getVersionContent,
    cleanupVersions,
    getVersionStats,
    isValidFilePath,
    formatBytes,
    VERSIONS_DIR
};