/**
 * Administrater Applet Helper Functions
 * 
 * This module provides functions to scan applets for admin.json files
 * and generate administrative dashboard data.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateAdminHTML() {
    const fullPath = path.join(__dirname, 'frontend', 'admin.html');
    const html = fs.readFileSync(fullPath, 'utf8');
    return html;
}


/**
 * Get the applets directory path
 * @returns {string} Path to the applets directory
 */
function getAppletsDirectory() {
    return path.join(__dirname, '..');
}

/**
 * Scan all applets for admin.json files
 * @returns {Promise<Array>} Array of applet admin configurations
 */
function scanAppletsForAdmin() {
    return new Promise((resolve, reject) => {
        const appletsDir = getAppletsDirectory();
        
        fs.readdir(appletsDir, (err, items) => {
            if (err) {
                return reject(err);
            }
            
            const adminConfigs = [];
            let pending = items.length;
            
            if (pending === 0) {
                return resolve(adminConfigs);
            }
            
            items.forEach(item => {
                const itemPath = path.join(appletsDir, item);
                
                // Check if it's a directory
                fs.stat(itemPath, (statErr, stats) => {
                    if (statErr || !stats.isDirectory()) {
                        if (--pending === 0) resolve(adminConfigs);
                        return;
                    }
                    
                    // Look for admin.json in this applet directory
                    const adminJsonPath = path.join(itemPath, 'admin.json');
                    
                    fs.access(adminJsonPath, fs.constants.F_OK, (accessErr) => {
                        if (!accessErr) {
                            // admin.json exists, read it
                            fs.readFile(adminJsonPath, 'utf8', (readErr, data) => {
                                if (!readErr) {
                                    try {
                                        const adminConfig = JSON.parse(data);
                                        adminConfig.appletName = item;
                                        adminConfig.appletPath = itemPath;
                                        adminConfigs.push(adminConfig);
                                    } catch (parseErr) {
                                        console.error(`Error parsing admin.json for ${item}:`, parseErr);
                                    }
                                }
                                
                                if (--pending === 0) resolve(adminConfigs);
                            });
                        } else {
                            if (--pending === 0) resolve(adminConfigs);
                        }
                    });
                });
            });
        });
    });
}

/**
 * Get admin configuration for a specific applet
 * @param {string} appletName - Name of the applet
 * @returns {Promise<Object|null>} Admin configuration or null if not found
 */
function getAppletAdminConfig(appletName) {
    return new Promise((resolve, reject) => {
        const appletsDir = getAppletsDirectory();
        const appletPath = path.join(appletsDir, appletName);
        const adminJsonPath = path.join(appletPath, 'admin.json');
        
        fs.access(adminJsonPath, fs.constants.F_OK, (err) => {
            if (err) {
                return resolve(null);
            }
            
            fs.readFile(adminJsonPath, 'utf8', (readErr, data) => {
                if (readErr) {
                    return reject(readErr);
                }
                
                try {
                    const adminConfig = JSON.parse(data);
                    adminConfig.appletName = appletName;
                    adminConfig.appletPath = appletPath;
                    resolve(adminConfig);
                } catch (parseErr) {
                    reject(parseErr);
                }
            });
        });
    });
}

/**
 * Get system information for the admin dashboard
 * @returns {Object} System information
 */
function getSystemInfo() {
    const startTime = process.uptime();
    const memUsage = process.memoryUsage();
    
    return {
        uptime: startTime,
        uptimeFormatted: formatUptime(startTime),
        memory: {
            rss: Math.round(memUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024)
        },
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid
    };
}

/**
 * Format uptime in human-readable format
 * @param {number} seconds - Uptime in seconds
 * @returns {string} Formatted uptime string
 */
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);
    
    return parts.join(' ') || '0s';
}

/**
 * Validate admin.json structure
 * @param {Object} config - Admin configuration to validate
 * @returns {Object} Validation result
 */
function validateAdminConfig(config) {
    const result = {
        isValid: true,
        errors: []
    };
    
    // Required fields
    const requiredFields = ['title', 'description'];
    
    requiredFields.forEach(field => {
        if (!config[field]) {
            result.isValid = false;
            result.errors.push(`Missing required field: ${field}`);
        }
    });
    
    // Optional but recommended fields
    const optionalFields = ['version', 'status', 'actions', 'stats'];
    
    return result;
}

export {
    scanAppletsForAdmin,
    getAppletAdminConfig,
    getSystemInfo,
    formatUptime,
    validateAdminConfig,
    generateAdminHTML
}; 