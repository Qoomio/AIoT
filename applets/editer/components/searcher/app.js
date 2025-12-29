import fs from 'fs';
import path from 'path';
import { isValidFilePath, sanitizeFilePath } from '../../utils/common.js';

/**
 * Simple pattern matching for file paths
 * @param {string} filePath - File path to test
 * @param {string} pattern - Pattern to match (supports * wildcard)
 * @returns {boolean} - Whether the path matches the pattern
 */
function matchesPattern(filePath, pattern) {
  if (!pattern) return false;
  
  const fileName = path.basename(filePath);
  const fileExt = path.extname(fileName);
  
  // Handle common patterns like *.js, *.html, etc.
  // If pattern starts with *., check only the extension
  if (pattern.trim().startsWith('*.')) {
    const ext = pattern.trim().substring(1); // Remove * to get .js
    return fileExt.toLowerCase() === ext.toLowerCase();
  }
  
  // Handle patterns like test*.js
  if (pattern.includes('*') && pattern.includes('.')) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\./g, '\\.');
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(fileName);
  }
  
  // For directory patterns or full path patterns
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
    .replace(/\./g, '\\.');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filePath) || regex.test(fileName);
}


/**
 * Improved async search with streaming and performance optimizations
 */
async function searchInFiles(searchTerm, options = {}) {
    const {
      caseSensitive = false,
      wholeWord = false,
      regex = false,
      includePattern = '',
      excludePattern = '',
      maxResults = 500, // Reduced for faster results
      maxFileSize = 512 * 1024, // 512KB limit for faster processing
      timeout = 15000 // 15 second timeout
    } = options;
  
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Search timeout')), timeout);
    });
  
    try {
      console.log('Starting search...')
      const searchPromise = performSearch();
      return await Promise.race([searchPromise, timeoutPromise]);
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  
    async function performSearch() {
      // Get files with streaming directory traversal
      const files = await getAllFilesAsync('.', { includePattern, excludePattern });
      const results = [];
      const processed = { files: 0, total: files.length };
      console.log({ processed })
  
      // Create search regex
      let searchRegex;
      try {
        console.log('Creating search regex with options:', {
          searchTerm,
          regex: Boolean(regex),
          wholeWord: Boolean(wholeWord),
          caseSensitive: Boolean(caseSensitive)
        });
        
        if (regex) {
          // For regex mode, use the search term as-is (user provides the regex pattern)
          // Note: wholeWord is ignored in regex mode since user controls the pattern
          if (!searchTerm || searchTerm.trim() === '') {
            throw new Error('Regular expression pattern cannot be empty');
          }
          
          const flags = caseSensitive ? 'g' : 'gi';
          try {
            searchRegex = new RegExp(searchTerm, flags);
            
            // Test the regex to make sure it's valid
            try {
              searchRegex.test('');
            } catch (testError) {
              throw new Error(`Invalid regular expression: ${testError.message}`);
            }
            
            console.log('Regex mode - regex created successfully:', {
              searchTerm,
              pattern: searchRegex.source,
              flags: searchRegex.flags,
              global: searchRegex.global,
              ignoreCase: searchRegex.ignoreCase
            });
          } catch (regexError) {
            console.error('Invalid regex pattern:', {
              searchTerm,
              error: regexError.message,
              stack: regexError.stack
            });
            throw new Error(`Invalid regular expression: ${regexError.message}. Please check your regex pattern.`);
          }
        } else {
          // Normal text search mode - escape special regex characters
          const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          if (wholeWord) {
            // Use word boundaries - \b matches between \w (word char) and \W (non-word char)
            // This ensures we match complete words only
            // \b is a zero-width assertion that matches:
            // - Between \w and \W (word char to non-word char)
            // - Between \W and \w (non-word char to word char)
            // - At the start/end of string if adjacent to \w
            const pattern = `\\b${escapedTerm}\\b`;
            searchRegex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
            console.log('Whole word mode - escaped term with word boundaries:', {
              originalTerm: searchTerm,
              escapedTerm,
              pattern: searchRegex.source
            });
          } else {
            searchRegex = new RegExp(escapedTerm, caseSensitive ? 'g' : 'gi');
            console.log('Normal text search - escaped term:', {
              originalTerm: searchTerm,
              escapedTerm,
              pattern: searchRegex.source
            });
          }
        }
        
        console.log('Final search regex:', {
          searchTerm,
          wholeWord: regex ? 'N/A (regex mode)' : wholeWord,
          regex,
          caseSensitive,
          pattern: searchRegex.source,
          flags: searchRegex.flags
        });
      } catch (regexError) {
        console.error('Regex creation error:', regexError);
        throw new Error(`Invalid ${regex ? 'regular expression' : 'search pattern'}: ${regexError.message}`);
      }
  
      // Process files in smaller batches for better responsiveness
      const batchSize = 10; // Reduced batch size for better responsiveness
      console.log(`Searching in ${files.length} files for: "${searchTerm}"`);
      
      for (let i = 0; i < files.length; i += batchSize) {
        if (results.length >= maxResults) break;
        
        const batch = files.slice(i, i + batchSize);
        const batchPromises = batch.map(filePath => searchInFile(filePath, searchRegex, maxFileSize));
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            results.push(result.value);
            if (results.length >= maxResults) break;
          }
          processed.files++;
        }
        
        // Log progress periodically
        if (i % 50 === 0) {
          console.log(`Processed ${processed.files}/${files.length} files, found ${results.length} matches`);
        }
        
        // Small delay to prevent blocking event loop completely
        if (i % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
  
      return results;
    }
  }
  
  /**
   * Async file traversal with better performance
   */
  async function getAllFilesAsync(dirPath = '.', options = {}) {
    const files = [];
    const { includePattern = '', excludePattern = '' } = options;
    
    const includeGlobs = includePattern.split(',').map(p => p.trim()).filter(Boolean);
    const excludeGlobs = excludePattern.split(',').map(p => p.trim()).filter(Boolean);
  
      async function walkDirectory(currentPath, depth = 0) {
    // Prevent infinite recursion and very deep nesting
    if (depth > 10) {
      console.warn(`Skipping deeply nested directory: ${currentPath} (depth: ${depth})`);
      return;
    }
    
    try {
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          // Skip hidden files and directories
          if (entry.name.startsWith('.')) continue;
          
          const fullPath = path.join(currentPath, entry.name);
          const relativePath = path.relative('.', fullPath);
          
          if (entry.isDirectory()) {
            // Skip common exclude directories and large directories
            const excludedDirs = [
              'node_modules', '.git', 'dist', 'build', '.vscode', 'logs',
              'BuildYourOwnLLM_Book', 'monaco-editor', 'min', 'min-maps', 
              'dev', 'esm', 'coverage', 'tmp', 'temp', 'cache',
              'bower_components', '.npm', '.yarn', '.pnpm'
            ];
            if (excludedDirs.includes(entry.name)) {
              continue;
            }
            
            // Check exclude patterns for directories
            if (excludeGlobs.some(pattern => matchesPattern(relativePath, pattern))) {
              continue;
            }
            
            // Recursively walk subdirectory
            await walkDirectory(fullPath, depth + 1);
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
        console.warn(`Warning: Could not read directory ${currentPath}:`, error.message);
      }
    }
  
    await walkDirectory(sanitizeFilePath(dirPath));
    return files;
  }
  
  /**
   * Search in a single file with streaming and size limits
   */
  async function searchInFile(filePath, searchRegex, maxFileSize) {
    try {
      // Skip binary files and other non-searchable files by checking extension
      const ext = path.extname(filePath).toLowerCase();
      const binaryExtensions = [
        // Images
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.ico', '.svg', '.webp',
        // Archives
        '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
        // Executables
        '.exe', '.dll', '.so', '.dylib', '.app', '.deb', '.rpm',
        // Documents
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        // Media
        '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.wav', '.ogg',
        // Fonts
        '.ttf', '.woff', '.woff2', '.eot', '.otf',
        // Others
        '.bin', '.dat', '.db', '.sqlite', '.lock', '.map'
      ];
      if (binaryExtensions.includes(ext)) {
        return null;
      }
      
      // Skip files that are likely large or not useful for search
      const skipFiles = [
        'package-lock.json', 'yarn.lock', 'composer.lock',
        '.DS_Store', 'Thumbs.db', '.gitkeep'
      ];
      if (skipFiles.includes(path.basename(filePath))) {
        return null;
      }
  
      // Check file size before reading
      const stats = await fs.promises.stat(sanitizeFilePath(filePath));
      if (stats.size > maxFileSize) {
        console.warn(`Skipping large file: ${filePath} (${stats.size} bytes)`);
        return null;
      }
  
      const content = await fs.promises.readFile(sanitizeFilePath(filePath), 'utf8');
      const lines = content.split('\n');
      const matches = [];
      
      // Search line by line with early termination
      for (let lineIndex = 0; lineIndex < lines.length && matches.length < 100; lineIndex++) {
        const line = lines[lineIndex];
        let match;
        
        // Reset regex to find all matches in this line
        searchRegex.lastIndex = 0;
        
        // Try to find matches in this line
        let matchCount = 0;
        while ((match = searchRegex.exec(line)) !== null && matches.length < 100) {
          matchCount++;
          matches.push({
            line: lineIndex + 1,
            column: match.index + 1,
            content: line.trim(),
            match: match[0]
          });
          
          // Prevent infinite loop with zero-width matches
          if (match.index === searchRegex.lastIndex) {
            searchRegex.lastIndex++;
          }
          
          // Safety check: prevent infinite loops
          if (matchCount > 1000) {
            console.warn(`Too many matches in line ${lineIndex + 1}, stopping search`);
            break;
          }
        }
      }
      
      return matches.length > 0 ? { path: filePath, matches } : null;
      
    } catch (fileError) {
      console.warn(`Warning: Could not read file ${filePath}:`, fileError.message);
      return null;
    }
  }
  

/**
 * Replace text in files at specific locations
 * @param {Array} replacements - Array of replacement locations
 * @param {string} replaceText - Text to replace with
 * @returns {Promise<object>} - Results of replacement operations
 */
async function replaceInFiles(replacements, replaceText) {
    const results = {
    successful: [],
    errors: []
    };
    
    try {
      // Group replacements by file for efficient processingi
      const fileGroups = {};
      for (const replacement of replacements) {
          const { file, line, column, originalText, matchLength } = replacement;
          if (!fileGroups[file]) {
          fileGroups[file] = [];
          }
          fileGroups[file].push({ line, column, originalText, matchLength });
      }

    // Process each file
    for (const [filePath, fileReplacements] of Object.entries(fileGroups)) {
        try {
        // Validate file path
        if (!isValidFilePath(filePath)) {
            results.errors.push({
            file: filePath,
            error: 'Invalid file path'
            });
            continue;
        }
        
        const sanitizedPath = sanitizeFilePath(filePath);
        
        // Read the file
        let content;
        try {
            content = fs.readFileSync(sanitizedPath, 'utf8');
        } catch (readError) {
            results.errors.push({
            file: filePath,
            error: `Could not read file: ${readError.message}`
            });
            continue;
        }
        
        const lines = content.split('\n');
        let hasChanges = false;
        
        // Sort replacements by line and column (descending) to avoid offset issues
        fileReplacements.sort((a, b) => {
            if (a.line !== b.line) return b.line - a.line;
            return b.column - a.column;
        });
        
        // Apply replacements
        for (const replacement of fileReplacements) {
          const { line, column, originalText, matchLength } = replacement;
          const lineIndex = line - 1;
          const columnIndex = column - 1;
          
          if (lineIndex < 0 || lineIndex >= lines.length) {
          results.errors.push({
              file: filePath,
              line,
              column,
              error: 'Line number out of range'
          });
          continue;
          }
          
          const currentLine = lines[lineIndex];
          if (columnIndex < 0 || columnIndex >= currentLine.length) {
          results.errors.push({
              file: filePath,
              line,
              column,
              error: 'Column number out of range'
          });
          continue;
          }
          
          // Replace the exact matched text at the specified position
          if (originalText) {
              // Verify the original text matches what's at this position
              const textAtPosition = currentLine.substring(columnIndex, columnIndex + originalText.length);
              console.log(`Checking replacement at ${filePath}:${line}:${column}`);
              console.log(`Expected: "${originalText}"`);
              console.log(`Found: "${textAtPosition}"`);
              
              if (textAtPosition === originalText) {
                  const beforeMatch = currentLine.substring(0, columnIndex);
                  const afterMatch = currentLine.substring(columnIndex + originalText.length);
                  lines[lineIndex] = beforeMatch + replaceText + afterMatch;
                  hasChanges = true;
                  console.log(`Successfully replaced text in ${filePath}`);
              } else {
                  console.log(`Text mismatch in ${filePath} at ${line}:${column}`);
                  results.errors.push({
                      file: filePath,
                      line,
                      column,
                      error: `Original text "${originalText}" not found at specified position. Found: "${textAtPosition}"`
                  });
              }
          } else {
              results.errors.push({
                  file: filePath,
                  line,
                  column,
                  error: 'Original text not provided for replacement'
              });
          }
      }
        
        // Write the file if there were changes
        if (hasChanges) {
            try {
            fs.writeFileSync(sanitizedPath, lines.join('\n'), 'utf8');
            results.successful.push({
                file: filePath,
                replacements: fileReplacements.length
            });
            } catch (writeError) {
            results.errors.push({
                file: filePath,
                error: `Could not write file: ${writeError.message}`
            });
            }
        }
        
        } catch (fileError) {
            results.errors.push({
                file: filePath,
                error: fileError.message
            });
        }
    }
    
        return results;
    
    } catch (error) {
        throw new Error(`Replace operation failed: ${error.message}`);
    }
}

export {
    searchInFiles,
    replaceInFiles,
  };