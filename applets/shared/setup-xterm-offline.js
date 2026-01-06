#!/usr/bin/env node

/**
 * Setup script for copying xterm.js files to terminaler frontend lib directory
 * 
 * This script automates the process of copying xterm.js and addon files from
 * node_modules to the local frontend lib directory for offline usage.
 */

const fs = require('fs');
const path = require('path');

// Source and destination paths
const sourceDir = path.join(__dirname, '..', 'node_modules', '@xterm');
const destDir = path.join(__dirname, '..', 'applets', 'terminaler', 'frontend', 'lib', 'xterm');

// Files to copy
const filesToCopy = [
    {
        source: path.join(sourceDir, 'xterm', 'lib', 'xterm.js'),
        dest: path.join(destDir, 'xterm.js')
    },
    {
        source: path.join(sourceDir, 'xterm', 'css', 'xterm.css'),
        dest: path.join(destDir, 'xterm.css')
    },
    {
        source: path.join(sourceDir, 'addon-fit', 'lib', 'addon-fit.js'),
        dest: path.join(destDir, 'addons', 'addon-fit.js')
    },
    {
        source: path.join(sourceDir, 'addon-web-links', 'lib', 'addon-web-links.js'),
        dest: path.join(destDir, 'addons', 'addon-web-links.js')
    },
    {
        source: path.join(sourceDir, 'addon-search', 'lib', 'addon-search.js'),
        dest: path.join(destDir, 'addons', 'addon-search.js')
    }
];

/**
 * Ensure directory exists
 * @param {string} dir - Directory path
 */
function ensureDirectory(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
}

/**
 * Copy a file from source to destination
 * @param {string} source - Source file path
 * @param {string} dest - Destination file path
 */
function copyFile(source, dest) {
    try {
        if (!fs.existsSync(source)) {
            console.error(`❌ Source file not found: ${source}`);
            return false;
        }
        
        // Ensure destination directory exists
        ensureDirectory(path.dirname(dest));
        
        // Copy the file
        fs.copyFileSync(source, dest);
        
        // Get file size for confirmation
        const stats = fs.statSync(dest);
        const fileSizeKB = Math.round(stats.size / 1024);
        
        console.log(`✅ Copied: ${path.basename(source)} (${fileSizeKB}KB)`);
        return true;
    } catch (error) {
        console.error(`❌ Error copying ${source}:`, error.message);
        return false;
    }
}

/**
 * Main setup function
 */
function setupXtermOffline() {
    console.log('🚀 Setting up xterm.js for offline usage...\n');
    
    // Check if node_modules/@xterm exists
    if (!fs.existsSync(sourceDir)) {
        console.error('❌ @xterm packages not found in node_modules');
        console.error('Please run: npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links @xterm/addon-search');
        process.exit(1);
    }
    
    // Create destination directories
    ensureDirectory(destDir);
    ensureDirectory(path.join(destDir, 'addons'));
    
    // Copy files
    let successCount = 0;
    let totalFiles = filesToCopy.length;
    
    console.log(`Copying ${totalFiles} files...\n`);
    
    for (const file of filesToCopy) {
        if (copyFile(file.source, file.dest)) {
            successCount++;
        }
    }
    
    // Summary
    console.log(`\n📊 Setup Summary:`);
    console.log(`   Files copied: ${successCount}/${totalFiles}`);
    
    if (successCount === totalFiles) {
        console.log('✅ All files copied successfully!');
        console.log('\n🎉 xterm.js is now ready for offline usage');
        console.log('   Files location: applets/terminaler/frontend/lib/xterm/');
        
        // List copied files
        console.log('\n📁 Available files:');
        const listFiles = (dir, prefix = '') => {
            try {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    if (stat.isDirectory()) {
                        console.log(`   ${prefix}📁 ${file}/`);
                        listFiles(filePath, prefix + '  ');
                    } else {
                        const fileSizeKB = Math.round(stat.size / 1024);
                        console.log(`   ${prefix}📄 ${file} (${fileSizeKB}KB)`);
                    }
                });
            } catch (error) {
                console.error(`Error listing files in ${dir}:`, error.message);
            }
        };
        
        listFiles(destDir);
        
    } else {
        console.log('❌ Some files failed to copy');
        console.log('Please check the errors above and try again');
        process.exit(1);
    }
}

/**
 * Check if files are already copied and up to date
 */
function checkFilesUpToDate() {
    for (const file of filesToCopy) {
        if (!fs.existsSync(file.dest)) {
            return false;
        }
        
        // Check if source is newer than destination
        try {
            const sourceStat = fs.statSync(file.source);
            const destStat = fs.statSync(file.dest);
            
            if (sourceStat.mtime > destStat.mtime) {
                return false;
            }
        } catch (error) {
            return false;
        }
    }
    return true;
}

// Run setup
if (require.main === module) {
    if (process.argv.includes('--check')) {
        // Check if files are up to date
        if (checkFilesUpToDate()) {
            console.log('✅ xterm.js files are up to date');
        } else {
            console.log('⚠️  xterm.js files need updating');
            console.log('Run: npm run update-xterm');
        }
    } else {
        setupXtermOffline();
    }
}

module.exports = {
    setupXtermOffline,
    checkFilesUpToDate
}; 