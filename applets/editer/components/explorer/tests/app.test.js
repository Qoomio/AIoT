/**
 * Explorer Sub-Applet Helper Functions Tests
 * 
 * Tests for the directory helper functions.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock the explorer app functions
const explorerApp = require('../app.js');

describe('Explorer App Tests', function() {
    
    describe('getDirectoryContents', function() {
        it('should return directory contents for current directory', async function() {
            const contents = await explorerApp.getDirectoryContents('.');
            
            assert.ok(Array.isArray(contents));
            assert.ok(contents.length > 0);
            
            // Check that each item has required properties
            contents.forEach(item => {
                assert.ok(typeof item.name === 'string');
                assert.ok(typeof item.path === 'string');
                assert.ok(typeof item.isDirectory === 'boolean');
                assert.ok(typeof item.isFile === 'boolean');
            });
        });
        
        it('should filter out hidden files and directories', async function() {
            const contents = await explorerApp.getDirectoryContents('.');
            
            // Check that no hidden files (starting with .) are included
            const hiddenFiles = contents.filter(item => item.name.startsWith('.'));
            assert.strictEqual(hiddenFiles.length, 0);
        });
        
        it('should sort directories before files', async function() {
            const contents = await explorerApp.getDirectoryContents('.');
            
            let foundFile = false;
            for (const item of contents) {
                if (item.isFile) {
                    foundFile = true;
                } else if (item.isDirectory && foundFile) {
                    // If we find a directory after finding a file, sorting is wrong
                    assert.fail('Directories should come before files');
                }
            }
        });
        
        it('should reject invalid directory paths', async function() {
            try {
                await explorerApp.getDirectoryContents('../../../etc');
                assert.fail('Should have rejected invalid path');
            } catch (error) {
                assert.ok(error.message.includes('Invalid directory path'));
            }
        });
        
        it('should handle non-existent directories', async function() {
            try {
                await explorerApp.getDirectoryContents('nonexistent-directory');
                assert.fail('Should have rejected non-existent directory');
            } catch (error) {
                assert.ok(error.code === 'ENOENT' || error.message.includes('no such file'));
            }
        });
        
        it('should handle empty directory parameter', async function() {
            const contents = await explorerApp.getDirectoryContents();
            
            assert.ok(Array.isArray(contents));
            // Should default to current directory
        });
        
        it('should handle root directory parameter', async function() {
            const contents = await explorerApp.getDirectoryContents('.');
            
            assert.ok(Array.isArray(contents));
            assert.ok(contents.length >= 0);
        });
    });
    
    describe('Module Export', function() {
        it('should export getDirectoryContents function', function() {
            assert.ok(typeof explorerApp.getDirectoryContents === 'function');
        });
        
        it('should not export internal functions', function() {
            // Make sure only intended functions are exported
            const exportedKeys = Object.keys(explorerApp);
            assert.deepStrictEqual(exportedKeys, ['getDirectoryContents']);
        });
    });
});

// Export for use in other test files
module.exports = {
    // Add any test utilities here
}; 