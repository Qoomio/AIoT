/**
 * Template Utility System
 * 
 * Provides a consistent way to load HTML template files and inject variables
 * Replaces template literals to avoid parsing issues with complex content
 */

import fs from 'fs';
import path from 'path';

/**
 * Read and process an HTML template file with variable injection
 * @param {string} templatePath - Path to the HTML template file
 * @param {object} variables - Object containing variables to inject
 * @returns {string} - Processed HTML content
 */
function loadTemplate(templatePath, variables = {}) {
    try {
        // Read the template file
        const fullPath = path.resolve(templatePath);
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
 * Load template relative to calling applet's directory
 * @param {string} appletPath - Path to the applet directory
 * @param {string} templateName - Name of the template file
 * @param {object} variables - Variables to inject
 * @returns {string} - Processed HTML content
 */
function loadAppletTemplate(appletPath, templateName, variables = {}) {
    const templatePath = path.join(appletPath, 'templates', templateName);
    return loadTemplate(templatePath, variables);
}

/**
 * Escape HTML content to prevent injection
 * @param {string} content - Content to escape
 * @returns {string} - Escaped content
 */
function escapeHtml(content) {
    if (typeof content !== 'string') return content;
    
    return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Safely encode content for embedding (using Base64 for complex content)
 * @param {string} content - Content to encode
 * @returns {string} - Base64 encoded content
 */
function safeEncode(content) {
    if (!content) return '';
    return Buffer.from(content, 'utf8').toString('base64');
}

export {
    loadTemplate,
    loadAppletTemplate,
    escapeHtml,
    safeEncode
}; 