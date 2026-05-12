/**
 * File Explorer JavaScript
 * 
 * Handles the file explorer functionality in the Monaco editor interface.
 */


'use strict';
import qoomEvent from "../../../utils/qoomEvent.js"
import * as searchTab from "../../searcher/frontend/search.js"

const expandedDirs = new Set();
// Prevent stale async directory loads from writing into a re-rendered/replaced DOM tree.
// Key: dirPath, Value: incrementing version number.
const dirLoadVersion = new Map();
// Auto-retry loading for expanded folders that remain stuck in "loading" state.
const dirLoadRetryCount = new Map();

let state = null;
let currentTab = 'explorer';
let dragCounter = 0;
let contextMenuTargetFolder = null;
let selectionAnchorPath = null;
let renameModalState = null;
let duplicateModalState = null;

function getFileTreeScope() {
    return document.getElementById('file-tree') || document;
}

function getNestedListByPath(dirPath, scope = getFileTreeScope()) {
    const lists = scope.querySelectorAll('.nested-files');
    for (const el of lists) {
        if (el.getAttribute('data-path') === dirPath) return el;
    }
    return null;
}

function getDirectoryItemByPath(dirPath, scope = getFileTreeScope()) {
    const items = scope.querySelectorAll('.file-item.directory');
    for (const el of items) {
        if (el.getAttribute('data-path') === dirPath) return el;
    }
    return null;
}

function ensureNestedListExists(dirPath, scope = getFileTreeScope()) {
    let nestedList = getNestedListByPath(dirPath, scope);
    if (nestedList) return nestedList;

    // Create nested container if it's missing (defensive against race / partial renders)
    const dirItem = getDirectoryItemByPath(dirPath, scope);
    if (!dirItem) return null;

    const liElement = dirItem.closest('li');
    if (!liElement) return null;

    const nestedHtml = '<ul class="nested-files expanded" data-path="' + dirPath + '">' +
        '<li class="loading"></li></ul>';
    liElement.insertAdjacentHTML('beforeend', nestedHtml);

    return getNestedListByPath(dirPath, liElement);
}

function scheduleLoadRetry(dirPath) {
    if (!expandedDirs.has(dirPath)) return;

    const retryCount = dirLoadRetryCount.get(dirPath) || 0;
    if (retryCount >= 3) return;

    dirLoadRetryCount.set(dirPath, retryCount + 1);
    const delay = 400 * (retryCount + 1);

    setTimeout(() => {
        if (!expandedDirs.has(dirPath)) return;
        const nested = getNestedListByPath(dirPath);
        // If the nested list doesn't exist yet (parent not rendered), try again.
        if (!nested) {
            loadDirectoryContents(dirPath);
            return;
        }
        
        if (nested.querySelector('li.loading')) loadDirectoryContents(dirPath);
    }, delay);
}

function kickStuckExpandedLoads(scope = getFileTreeScope()) {
    try {
        const lists = scope.querySelectorAll('.nested-files.expanded');
        lists.forEach((ul) => {
            const p = ul.getAttribute('data-path');
            if (!p) return;
            if (expandedDirs.has(p) && ul.querySelector('li.loading')) {
                scheduleLoadRetry(p);
            }
        });
    } catch (e) {
        console.error('kickStuckExpandedLoads error:', e);
    }
}

// Mobile device detection
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768) ||
           ('ontouchstart' in window);
}

// Mobile touch event handling
let touchStartTime = 0;
let touchStartPosition = { x: 0, y: 0 };
let longPressTimer = null;
let longPressThreshold = 500; // 500ms
let touchMoveThreshold = 10; // 10px

// --- Utility functions ---
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `upload-message upload-message-${type}`;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    setTimeout(() => { messageDiv.remove(); }, 3000);
}

// Get file icon for display — JetBrains-style official technology icons (locally served)
const ICON_BASE = '/view/applets/shared/assets';

function _di(name, variant = 'original') {
    return `<img src="${ICON_BASE}/${name}-${variant}.svg" width="16" height="16" style="display:block" onerror="this.style.display='none'">`;
}

function _doc(color, shade, label) {
    let text = '';
    if (label) {
        const n = label.length;
        const fs = n <= 1 ? 6.5 : n === 2 ? 5.2 : 4.2;
        text = `<text x="8" y="10" text-anchor="middle" dominant-baseline="middle" ` +
               `font-size="${fs}" font-family="'Courier New',monospace" ` +
               `font-weight="bold" fill="white" opacity="0.9">${label}</text>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">` +
           `<path d="M2 0h8l4 4v11H2z" fill="${color}"/>` +
           `<path d="M10 0l4 4h-4z" fill="${shade}"/>` +
           text + `</svg>`;
}

const FILE_ICONS = {
    folder: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">` +
            `<path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 ` +
            `1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H6.914a.5.5 0 0 1-.354-.146l-.853-.854A1.5 1.5 ` +
            `0 0 0 4.672 3H1.5z" fill="#dcb67a"/></svg>`,

    // Special full-filename matches
    byName: {
        'dockerfile':          _di('docker'),
        '.gitignore':          _di('git'),
        '.gitattributes':      _di('git'),
        '.env':                _doc('#4eaa25', '#3a8018', 'EN'),
        '.env.local':          _doc('#4eaa25', '#3a8018', 'EN'),
        '.eslintrc':           _doc('#4b32c3', '#3020a0', 'EL'),
        '.eslintrc.js':        _doc('#4b32c3', '#3020a0', 'EL'),
        '.eslintrc.json':      _doc('#4b32c3', '#3020a0', 'EL'),
        '.prettierrc':         _doc('#f7b93e', '#cc9010', 'PR'),
        '.prettierrc.json':    _doc('#f7b93e', '#cc9010', 'PR'),
        'package.json':        _di('nodejs', 'plain'),
        'package-lock.json':   _di('nodejs', 'plain'),
        'tsconfig.json':       _di('typescript'),
        'jsconfig.json':       _di('javascript'),
        'webpack.config.js':   _di('webpack'),
        'vite.config.js':      _di('vitejs'),
        'vite.config.ts':      _di('vitejs'),
        'next.config.js':      _di('nextjs', 'plain'),
        'next.config.ts':      _di('nextjs', 'plain'),
        'tailwind.config.js':  _di('tailwindcss', 'original'),
        'tailwind.config.ts':  _di('tailwindcss', 'original'),
        'readme.md':           _di('markdown'),
        'license':             _doc('#d4d4d4', '#aaaaaa', 'LI'),
        'makefile':            _doc('#e34c26', '#b83018', 'MK'),
    },

    // Extension-based matches
    byExt: {
        // JavaScript family
        'js':     _di('javascript'),
        'mjs':    _di('javascript'),
        'cjs':    _di('javascript'),
        'jsx':    _di('react'),
        // TypeScript family
        'ts':     _di('typescript'),
        'tsx':    _di('react'),
        // Web
        'html':   _di('html5'),
        'htm':    _di('html5'),
        'css':    _di('css3'),
        'scss':   _di('sass'),
        'sass':   _di('sass'),
        'less':   _doc('#1d365d', '#142848', 'LE'),
        // Data / Config
        'json':   _doc('#cbcb41', '#a8a820', '{}'),
        'jsonc':  _doc('#cbcb41', '#a8a820', '{}'),
        'xml':    _doc('#f97316', '#d45f00', 'XM'),
        'yml':    _doc('#cb171e', '#a01015', 'YM'),
        'yaml':   _doc('#cb171e', '#a01015', 'YM'),
        'toml':   _doc('#9c4221', '#7a3010', 'TM'),
        'ini':    _doc('#9b9b9b', '#6f6f6f', 'IN'),
        'env':    _doc('#4eaa25', '#3a8018', 'EN'),
        // Documentation
        'md':     _di('markdown'),
        'mdx':    _di('markdown'),
        'txt':    _doc('#9b9b9b', '#6f6f6f', 'TX'),
        // Python
        'py':     _di('python'),
        'pyw':    _di('python'),
        'ipynb':  _di('jupyter'),
        // Database
        'sql':    _di('mysql'),
        // Shell
        'sh':     _di('bash', 'plain'),
        'bash':   _di('bash', 'plain'),
        'zsh':    _di('bash', 'plain'),
        'fish':   _di('bash', 'plain'),
        // PHP
        'php':    _di('php', 'plain'),
        // Ruby
        'rb':     _di('ruby'),
        // Go
        'go':     _di('go', 'original'),
        // Rust
        'rs':     _di('rust', 'original'),
        // Java / Kotlin
        'java':   _di('java'),
        'kt':     _di('kotlin'),
        // Frontend frameworks
        'vue':    _di('vuejs'),
        'svelte': _di('svelte'),
        // C family
        'c':      _di('c'),
        'h':      _di('c'),
        'cpp':    _di('cplusplus'),
        'cc':     _di('cplusplus'),
        'cs':     _di('csharp'),
        // Other languages
        'swift':  _di('swift'),
        'dart':   _di('dart'),
        'r':      _di('r', 'plain'),
        'lua':    _di('lua', 'plain'),
        'ex':     _di('elixir'),
        'exs':    _di('elixir'),
        'hs':     _di('haskell'),
        // Image
        'svg':    _doc('#ff9900', '#cc7700', 'SG'),
        'png':    _doc('#ff9900', '#cc7700', 'IM'),
        'jpg':    _doc('#ff9900', '#cc7700', 'IM'),
        'jpeg':   _doc('#ff9900', '#cc7700', 'IM'),
        'gif':    _doc('#ff9900', '#cc7700', 'IM'),
        'webp':   _doc('#ff9900', '#cc7700', 'IM'),
        'ico':    _doc('#ff9900', '#cc7700', 'IC'),
        // Media
        'mp4':    _doc('#9c27b0', '#6a1b80', 'VD'),
        'mp3':    _doc('#9c27b0', '#6a1b80', 'AU'),
        'wav':    _doc('#9c27b0', '#6a1b80', 'AU'),
        // Documents
        'pdf':    _doc('#f40f02', '#c00000', 'PD'),
        // Archives
        'zip':    _doc('#9b9b9b', '#6f6f6f', 'ZP'),
        'gz':     _doc('#9b9b9b', '#6f6f6f', 'GZ'),
        'tar':    _doc('#9b9b9b', '#6f6f6f', 'TR'),
        // Fonts
        'woff':   _doc('#9b9b9b', '#6f6f6f', 'FT'),
        'woff2':  _doc('#9b9b9b', '#6f6f6f', 'FT'),
        'ttf':    _doc('#9b9b9b', '#6f6f6f', 'FT'),
        // Misc
        'lock':   _doc('#9b9b9b', '#6f6f6f', 'LK'),
        'log':    _doc('#9b9b9b', '#6f6f6f', 'LG'),
    }
};

function getFileIcon(fileName, isDirectory) {
    if (isDirectory) return FILE_ICONS.folder;
    const lower = fileName.toLowerCase();
    if (FILE_ICONS.byName[lower]) return FILE_ICONS.byName[lower];
    const ext = lower.includes('.') ? lower.split('.').pop() : '';
    return FILE_ICONS.byExt[ext] || (() => {
        // Fallback: gray document with up to 3-char uppercase extension label
        const label = ext ? ext.toUpperCase().slice(0, 3) : '?';
        const n = label.length;
        const fs = n <= 1 ? 6.5 : n === 2 ? 5.2 : 4.2;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">` +
               `<path d="M2 0h8l4 4v11H2z" fill="#858585"/>` +
               `<path d="M10 0l4 4h-4z" fill="#606060"/>` +
               `<text x="8" y="10" text-anchor="middle" dominant-baseline="middle" ` +
               `font-size="${fs}" font-family="'Courier New',monospace" ` +
               `font-weight="bold" fill="white" opacity="0.9">${label}</text>` +
               `</svg>`;
    })();
}

function getFileIconClass(fileName, isDirectory) {
    if (isDirectory) return 'directory';
    return fileName.split('.').pop().toLowerCase();
}

// --- Tab Toggle Functionality ---

/**
 * Switch between explorer and search tabs
 * Only one view is visible at a time, using the full explorer width
 * @param {string} tabName - 'explorer' or 'search'
 */
function switchTab(tabName) {
    const explorerView = document.getElementById('explorer-view');
    const searchView = document.getElementById('explorer-search-view');
    const searchBtn = document.getElementById('explorer-search-btn');

    if (tabName === 'explorer') {
        explorerView.classList.add('active');
        searchView.classList.remove('active');
        if (searchBtn) searchBtn.classList.remove('active');
    } else if (tabName === 'search') {
        explorerView.classList.remove('active');
        searchView.classList.add('active');
        if (searchBtn) searchBtn.classList.add('active');
        // Initialize search tab if not already initialized
        const searchContainer = searchView.querySelector('.search-tab-container');
        if (searchContainer && !searchContainer.hasAttribute('data-initialized')) {
            searchTab.initialize(searchContainer);
        }
    }

    currentTab = tabName;
}

function setupTabToggle() {
    // Setup search button in explorer-actions - toggle behavior
    const searchBtn = document.getElementById('explorer-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            // Toggle between explorer and search
            if (currentTab === 'search') {
                switchTab('explorer');
            } else {
                switchTab('search');
            }
        });
    }
}

// --- API functions ---

async function loadDirectory(path = '.') {
    try {
        const response = await fetch('/editer/explorer/_api/directory?path=' + encodeURIComponent(path));
        if (!response.ok) {
            throw new Error('Failed to load directory: ' + response.status);
        }
        return await response.json();
    } catch (error) {
        throw new Error('Network error: ' + error.message);
    }
}
async function createFile(fileName, content = '', template = '') {
    try {
        const data = { filePath: fileName, content: content };
        if (template) data.template = template;
        
        const response = await fetch('/edit/creator/_api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Failed to create file: ' + errorText);
        }
        return await response.json();
    } catch (error) {
        throw new Error('Network error: ' + error.message);
    }
}

async function deleteFile(filePath) {
    try {
        const response = await fetch('/edit/creator/_api/file/' + filePath, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Failed to delete file: ' + errorText);
        }
        return await response.json();
    } catch (error) {
        throw new Error('Network error: ' + error.message);
    }
}
async function deleteFolder(folderPath, recursive = false) {
    try {
        const response = await fetch('/edit/creator/_api/folder', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: folderPath, recursive: recursive })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Failed to delete folder: ' + errorText);
        }
        return await response.json();
    } catch (error) {
        throw new Error('Network error: ' + error.message);
    }
}
async function renameItem(oldPath, newPath) {
    try {
        const response = await fetch('/edit/creator/_api/rename', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath: oldPath, newPath: newPath })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Failed to rename item: ' + errorText);
        }
        return await response.json();
    } catch (error) {
        throw new Error('Network error: ' + error.message);
    }
}
async function duplicateFile(sourcePath, targetPath) {
    try {
        const response = await fetch('/edit/creator/_api/duplicate/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: sourcePath, targetPath: targetPath })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Failed to duplicate file: ' + errorText);
        }
        return await response.json();
    } catch (error) {
        throw new Error('Network error: ' + error.message);
    }
}
async function duplicateFolder(sourcePath, targetPath) {
    try {
        const response = await fetch('/edit/creator/_api/duplicate/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: sourcePath, targetPath: targetPath })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Failed to duplicate folder: ' + errorText);
        }
        return await response.json();
    } catch (error) {
        throw new Error('Network error: ' + error.message);
    }
}
async function createFolder(folderName) {
    try {
        const response = await fetch('/edit/creator/_api/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: folderName })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Failed to create folder: ' + errorText);
        }
        return await response.json();
    } catch (error) {
        throw new Error('Network error: ' + error.message);
    }
}

// --- File tree rendering and events ---

function createFileTreeHTML(items, parentPath = '', level = 0) {
    let html = '';
    items.forEach(item => {
        const itemPath = parentPath ? parentPath + '/' + item.name : item.name;
        const isExpanded = expandedDirs.has(itemPath);
        const isActive = itemPath === state.activeFilePath;
        html += '<li>';
        html += '<div class="file-item-wrapper">';
        html += '<div class="file-item ' +
            (item.isDirectory ? 'directory' : 'file') +
            (isActive ? ' active' : '') + '" ' +
            'data-path="' + itemPath + '" ' +
            'data-is-directory="' + item.isDirectory + '" ' +
            (isMobileDevice() ? '' : 'draggable="true"') + '>';
        if (item.isDirectory) {
            html += '<span class="expand-icon' + (isExpanded ? ' expanded' : '') + '">▶</span>';
        }
        html += '<span class="file-icon ' + getFileIconClass(item.name, item.isDirectory) + '">' +
            getFileIcon(item.name, item.isDirectory) + '</span>';
        html += '<span class="file-name">' + item.name + '</span>';
        html += '</div>';
        // Add more options button for mobile only (outside file-item)
        if (isMobileDevice()) {
            html += '<button class="more-options-btn" data-path="' + itemPath + '" data-is-directory="' + item.isDirectory + '" title="More options">⋯</button>';
        }
        html += '</div>';
        if (item.isDirectory && isExpanded) {
            html += '<ul class="nested-files expanded" data-path="' + itemPath + '">';
            html += '<li class="loading"></li>';
            html += '</ul>';
        }
        html += '</li>';
    });
    return html;
}

// --- Mobile Touch Events ---

// Mobile drag state
let isMobileDragging = false;
let touchStartFileItem = null;

// Touch start
function onTouchStart(e) {
    if (!isMobileDevice()) return;
    
    const fileItem = e.target.closest('.file-item');
    if (!fileItem) {
        // Allow scrolling if not a file-item
        return;
    }
    
    // Exclude more options button clicks
    if (e.target.closest('.more-options-btn')) {
        return;
    }
    
    touchStartTime = Date.now();
    const touch = e.touches[0];
    touchStartPosition = { x: touch.clientX, y: touch.clientY };
    touchStartFileItem = fileItem;
    
    // Start long press timer (for drag start)
    longPressTimer = setTimeout(() => {
        // Call desktop onDragStart function directly
        const syntheticEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
            target: fileItem,
            dataTransfer: {
                effectAllowed: 'move',
                dropEffect: 'none',
                setData: () => {},
                getData: () => draggedData?.path || ''
            }
        };
        onDragStart(syntheticEvent);
        isMobileDragging = true;
        document.body.style.overflow = 'hidden';
    }, longPressThreshold);
}

// Touch move
function onTouchMove(e) {
    if (!isMobileDevice()) return;
    
    if (!isMobileDragging) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartPosition.x);
        const deltaY = Math.abs(touch.clientY - touchStartPosition.y);
        
        // Cancel long press if movement exceeds threshold and allow scrolling
        if (deltaX > touchMoveThreshold || deltaY > touchMoveThreshold) {
            clearLongPressTimer();
        }
    } else {
        // Use desktop drag functions directly when dragging
        e.preventDefault();
        const touch = e.touches[0];
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const syntheticEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
            target: elementBelow,
            clientX: touch.clientX,
            clientY: touch.clientY,
            dataTransfer: {
                dropEffect: 'none'
            }
        };
        
        // Call desktop drag functions directly
        onDragOver(syntheticEvent);
        onDragEnter(syntheticEvent);
    }
}

// Touch end
function onTouchEnd(e) {
    if (!isMobileDevice()) return;
    
    if (isMobileDragging) {
        // Handle drag end - use desktop drop function directly
        e.preventDefault();
        const touch = e.changedTouches[0];
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const syntheticEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
            target: elementBelow,
            clientX: touch.clientX,
            clientY: touch.clientY
        };
        
        // Call desktop drop function directly
        onDrop(syntheticEvent);
        isMobileDragging = false;
        document.body.style.overflow = '';
    } else {
        clearLongPressTimer();
        
        // Handle as normal touch if long press didn't occur
        const fileItem = e.target.closest('.file-item');
        if (!fileItem) return;
        
        const touchDuration = Date.now() - touchStartTime;
        const touch = e.changedTouches[0];
        const deltaX = Math.abs(touch.clientX - touchStartPosition.x);
        const deltaY = Math.abs(touch.clientY - touchStartPosition.y);
        
        // Treat as click if short touch and minimal movement
        if (touchDuration < longPressThreshold && 
            deltaX < touchMoveThreshold && 
            deltaY < touchMoveThreshold) {
            
            const path = fileItem.getAttribute('data-path');
            const isDirectory = fileItem.getAttribute('data-is-directory') === 'true';
            
            if (isDirectory) {
                toggleDirectory(fileItem, path);
            } else {
                openFileInEditor(path);
            }
        }
    }
    
    touchStartFileItem = null;
}

// Clear long press timer
function clearLongPressTimer() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

// --- Drag and Drop Implementation ---

let draggedElement = null;
let draggedData = null;
let currentDropTarget = null;
let autoScrollRAF = null;

function autoScrollOnDrag(e) {
    const scrollContainer = document.querySelector('.explorer-content.active');
    if (!scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    const edgeSize = 40;
    const maxSpeed = 8;
    const cursorY = e.clientY;

    let speed = 0;
    if (cursorY < rect.top + edgeSize) {
        speed = -maxSpeed * (1 - (cursorY - rect.top) / edgeSize);
    } else if (cursorY > rect.bottom - edgeSize) {
        speed = maxSpeed * (1 - (rect.bottom - cursorY) / edgeSize);
    }

    if (autoScrollRAF) cancelAnimationFrame(autoScrollRAF);

    if (speed !== 0) {
        (function scroll() {
            scrollContainer.scrollTop += speed;
            autoScrollRAF = requestAnimationFrame(scroll);
        })();
    }
}

function stopAutoScroll() {
    if (autoScrollRAF) {
        cancelAnimationFrame(autoScrollRAF);
        autoScrollRAF = null;
    }
}

// Multi-selection state
let selectedFiles = new Set();
let lastSelectedItem = null;
let isMultiSelectMode = false;

// Selection helper functions
function toggleFileSelection(fileItem, path) {
    if (selectedFiles.has(path)) {
        selectedFiles.delete(path);
        fileItem.classList.remove('selected');
    } else {
        selectedFiles.add(path);
        fileItem.classList.add('selected');
    }
    updateMultiSelectMode();
}

function clearSelection() {
    selectedFiles.clear();
    document.querySelectorAll('.file-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    updateMultiSelectMode();
}

function selectRange(startItem, endItem) {
    clearSelection();

    const allItems = Array.from(document.querySelectorAll('.file-item'));
    const startIndex = allItems.indexOf(startItem);
    const endIndex = allItems.indexOf(endItem);

    if (startIndex === -1 || endIndex === -1) return;

    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);

    for (let i = minIndex; i <= maxIndex; i++) {
        const item = allItems[i];
        const path = item.getAttribute('data-path');
        selectedFiles.add(path);
        item.classList.add('selected');
    }
    updateMultiSelectMode();
}

function updateMultiSelectMode() {
    // Update selected files based on active items
    selectedFiles.clear();
    document.querySelectorAll('.file-item.active').forEach(item => {
        const path = item.getAttribute('data-path');
        if (path) {
            selectedFiles.add(path);
        }
    });

    isMultiSelectMode = selectedFiles.size > 0;
    updateSelectionStatus();
}

function updateSelectionStatus() {
    // Remove existing status
    const existingStatus = document.querySelector('.selection-status');
    if (existingStatus) existingStatus.remove();

    if (selectedFiles.size > 0) {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'selection-status';
        statusDiv.innerHTML = `
            <span>${selectedFiles.size} item${selectedFiles.size !== 1 ? 's' : ''} selected</span>
            <button class="clear-selection-btn">Clear</button>
        `;

        // Add event listener to clear button
        statusDiv.querySelector('.clear-selection-btn').addEventListener('click', clearSelection);

        const explorerHeader = document.querySelector('.explorer-header');
        if (explorerHeader) {
            explorerHeader.appendChild(statusDiv);
        }
    }
}

// Make clearSelection available globally for context menu
window.clearSelection = clearSelection;

// Drag start
function onDragStart(e) {
    console.log('=== onDragStart called ===', e.target);

    // Simple text selection prevention
    window.getSelection().removeAllRanges();

    const fileItem = e.target.closest('.file-item');
    if (!fileItem) {
        console.log('No file item found for drag');
        return;
    }

    const path = fileItem.getAttribute('data-path');
    const isDirectory = fileItem.getAttribute('data-is-directory') === 'true';

    console.log('Starting drag for:', { path, isDirectory });

    // Get all active/selected items
    const activeItems = document.querySelectorAll('.file-item.active');
    const activeCount = activeItems.length;

    // Check if current item is selected
    const isItemActive = fileItem.classList.contains('active');

    if (activeCount > 1 && isItemActive) {
        // Dragging multiple selected files
        const activePaths = [];
        activeItems.forEach(item => {
            const itemPath = item.getAttribute('data-path');
            activePaths.push(itemPath);
            item.classList.add('dragging');
        });

        draggedElement = fileItem;
        draggedData = {
            paths: activePaths,
            isMultiple: true
        };

        console.log('Dragging multiple items:', draggedData.paths);
    } else {
        // Single file drag or dragging non-selected item
        // Clear any existing selection
        activeItems.forEach(item => {
            item.classList.remove('active');
        });

        // Select and drag only this item
        fileItem.classList.add('active');
        fileItem.classList.add('dragging');

        draggedElement = fileItem;
        draggedData = {
            paths: [path],
            isMultiple: false
        };

        console.log('Dragging single item:', path);
    }

    // Set drag data - simplified approach
    if (e.dataTransfer) {
        console.log('Setting dataTransfer data...');
        try {
            // Use a simple text format that won't conflict
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'internal-file-move');
            console.log('DataTransfer set successfully');

            // Set custom drag image for multiple files
            if (draggedData.isMultiple && draggedData.paths.length > 1) {
                const dragImage = document.createElement('div');
                dragImage.className = 'drag-image-multi';
                dragImage.innerHTML = `<span class="drag-count">${draggedData.paths.length} items</span>`;
                dragImage.style.cssText = `
                    position: absolute;
                    top: -1000px;
                    background: #007acc;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                `;
                document.body.appendChild(dragImage);
                e.dataTransfer.setDragImage(dragImage, 0, 0);
                setTimeout(() => dragImage.remove(), 0);
            }
        } catch (error) {
            console.error('Error setting dataTransfer:', error);
        }
    } else {
        console.log('No dataTransfer available');
    }

    console.log('=== Drag start complete ===', { draggedData });
}

function updateDropTarget(newTarget) {
    if (currentDropTarget === newTarget) return;
    if (currentDropTarget) {
        currentDropTarget.classList.remove('drag-over');
        currentDropTarget.classList.remove('root-drop-active');
    }
    currentDropTarget = newTarget;
    if (currentDropTarget) {
        if (currentDropTarget.classList.contains('file-tree-container')) {
            currentDropTarget.classList.add('root-drop-active');
        } else {
            currentDropTarget.classList.add('drag-over');
        }
    }
}

// Drag over (check if drop is allowed + visual feedback)
function onDragOver(e) {
    if (draggedData) {
        console.log('=== Allowing drop ===');
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    const fileItem = e.target.closest('.file-item');
    const container = e.target.closest('.file-tree-container');

    if (fileItem) {
        if (fileItem === draggedElement) {
            updateDropTarget(null);
            return;
        }

        const isDirectory = fileItem.getAttribute('data-is-directory') === 'true';
        const targetPath = fileItem.getAttribute('data-path');

        // Check if valid drop target for all dragged files
        if (isDirectory && draggedData && draggedData.paths) {
            let isValidTarget = true;
            for (const dragPath of draggedData.paths) {
                if (targetPath === dragPath || isDescendantPath(targetPath, dragPath)) {
                    isValidTarget = false;
                    break;
                }
            }

            if (isValidTarget) {
                // Add visual feedback for valid drop target
                updateDropTarget(fileItem);
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'move';
                }
            } else {
                updateDropTarget(null);
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'none';
                }
            }
        } else if (!isDirectory) {
            // Can't drop on a file
            updateDropTarget(null);
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'none';
            }
        }
    } else if (container && draggedData) {
        // Hovering over the container (root level drop)
        updateDropTarget(container);
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
    } else {
        updateDropTarget(null);
    }
}

// Track the current drag over element
let currentDragOverElement = null;
let dragEnterCounter = 0;

// Drag enter (visual feedback)
function onDragEnter(e) {
    if (!draggedData) return;

    e.preventDefault();
    // Don't stop propagation for internal drags

    dragEnterCounter++;

    // Find the closest directory item (including parent directories)
    let targetElement = e.target;
    let directoryItem = null;

    // Check if we're over a file item or its children
    while (targetElement && targetElement !== document.body) {
        if (targetElement.classList && targetElement.classList.contains('file-item')) {
            const isDirectory = targetElement.getAttribute('data-is-directory') === 'true';
            if (isDirectory) {
                directoryItem = targetElement;
                break;
            }
        }
        // Also check if we're over the file tree container (for root drops)
        if (targetElement.id === 'file-tree-container' || targetElement.id === 'file-tree') {
            // Treat the container as the root directory
            directoryItem = targetElement;
            directoryItem.setAttribute('data-path', '.');
            directoryItem.setAttribute('data-is-directory', 'true');
            break;
        }
        targetElement = targetElement.parentElement;
    }

    // If we found a directory, check if it's valid
    if (directoryItem) {
        const targetPath = directoryItem.getAttribute('data-path');

        if (draggedData.paths) {
            let isValidTarget = true;
            for (const dragPath of draggedData.paths) {
                if (targetPath === dragPath || isDescendantPath(targetPath, dragPath)) {
                    isValidTarget = false;
                    break;
                }
            }

            if (isValidTarget) {
                // Remove previous highlight
                if (currentDragOverElement && currentDragOverElement !== directoryItem) {
                    currentDragOverElement.classList.remove('drag-over');
                }
                directoryItem.classList.add('drag-over');
                currentDragOverElement = directoryItem;
            }
        }
    } else {
        // Check for container
        const container = e.target.closest('.file-tree-container');
        if (container) {
            container.classList.add('root-drop-active');
        }
    }
}

// Drag leave (handle leaving the container)
function onDragLeave(e) {
    if (!draggedData) return;

    e.preventDefault();
    // Don't stop propagation for internal drags

    dragEnterCounter--;

    // Only remove highlight when completely leaving the element
    if (dragEnterCounter <= 0) {
        dragEnterCounter = 0;

        if (currentDragOverElement) {
            currentDragOverElement.classList.remove('drag-over');
            currentDragOverElement = null;
        }

        const container = e.target.closest('.file-tree-container');
        if (container) {
            container.classList.remove('root-drop-active');
        }
    }
}

// Drop handling
function onDrop(e) {
    console.log('🚀🚀🚀 DROP EVENT TRIGGERED!!! 🚀🚀🚀');

    if (!draggedData) {
        console.log('❌ No drag data');
        return;
    }

    console.log('✅ Processing drop...');
    e.preventDefault();

    console.log('=== Drop accepted - have draggedData ===', { draggedData });

    // Find the target directory (including parent directories)
    let targetElement = e.target;
    let directoryItem = null;
    let targetPath = '.';

    // Look for a directory element in the hierarchy
    while (targetElement && targetElement !== document.body) {
        if (targetElement.classList && targetElement.classList.contains('file-item')) {
            const isDirectory = targetElement.getAttribute('data-is-directory') === 'true';
            if (isDirectory) {
                directoryItem = targetElement;
                break;
            }
        }
        // Also check if we're over the file tree container (for root drops)
        if (targetElement.id === 'file-tree-container' || targetElement.id === 'file-tree') {
            // Treat as root directory drop
            targetPath = '.';
            console.log('Drop on root container detected');
            break;
        }
        targetElement = targetElement.parentElement;
    }

    // Determine the actual target path
    if (directoryItem) {
        targetPath = directoryItem.getAttribute('data-path');
    }

    console.log('Drop target determined:', { targetPath, draggedPaths: draggedData.paths, directoryItem });

    // Check if valid drop target
    let isValidTarget = true;
    if (draggedData && draggedData.paths) {
        // Check if any of the dragged items would create invalid moves
        for (const dragPath of draggedData.paths) {
            if (targetPath === dragPath || isDescendantPath(targetPath, dragPath)) {
                isValidTarget = false;
                break;
            }
        }
    }

    if (!isValidTarget) {
        console.log('Invalid drop target - cannot drop into itself or descendants');
        cleanupDrag();
        return;
    }

    console.log(`Moving ${draggedData.paths.length} items to:`, targetPath);

    // Perform multiple moves
    if (draggedData.paths && draggedData.paths.length > 0) {
        // Use async to wait for the moves to complete
        performMultipleMove(draggedData.paths, targetPath).then(() => {
            console.log('All moves completed');
            // Clear selection after successful move
            clearSelection();
            // Refresh the file tree
            refreshFileTree();
        }).catch((error) => {
            console.error('Error during multiple move:', error);
            // Let original system handle error notifications
        });
    }

    cleanupDrag();
}

// Drag end (cleanup)
function onDragEnd(e) {
    // Re-enable text selection
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';

    cleanupDrag();
}

// Cleanup drag state
function cleanupDrag() {
    try {
        // Remove dragging style from all elements
        document.querySelectorAll('.file-item.dragging').forEach(item => {
            item.classList.remove('dragging');
        });

        // Remove all visual feedback
        const dragOverElements = document.querySelectorAll('.drag-over');
        dragOverElements.forEach(el => {
            el.classList.remove('drag-over');
        });

        const rootDropElements = document.querySelectorAll('.root-drop-active');
        rootDropElements.forEach(el => {
            el.classList.remove('root-drop-active');
        });

        // Reset counters and references
        dragEnterCounter = 0;
        currentDragOverElement = null;
        draggedElement = null;
        draggedData = null;

        // Re-enable text selection
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
    } catch (error) {
        console.error('Drag cleanup error:', error);
        // Initialize state even if error occurs
        dragEnterCounter = 0;
        currentDragOverElement = null;
        draggedElement = null;
        draggedData = null;
    }
}

// New function to handle multiple file moves
async function performMultipleMove(sourcePaths, targetPath) {
    const totalFiles = sourcePaths.length;
    let successCount = 0;
    let failedFiles = [];

    console.log('Starting multiple move:', { sourcePaths, targetPath });
    // Remove the initial "Moving..." message to reduce toast spam

    for (const sourcePath of sourcePaths) {
        try {
            const fileName = sourcePath.split('/').pop();

            // Use a more reliable selector
            let fileItem = null;
            const allFileItems = document.querySelectorAll('.file-item');
            for (const item of allFileItems) {
                if (item.getAttribute('data-path') === sourcePath) {
                    fileItem = item;
                    break;
                }
            }

            const isDirectory = fileItem ? fileItem.getAttribute('data-is-directory') === 'true' : false;

            console.log(`Moving ${fileName} from ${sourcePath} to ${targetPath}, isDirectory: ${isDirectory}`);
            await performMove(sourcePath, targetPath, isDirectory);
            successCount++;

            console.log(`Moved ${fileName} successfully (${successCount}/${totalFiles})`);
        } catch (error) {
            console.error(`Failed to move ${sourcePath}:`, error);
            failedFiles.push(sourcePath.split('/').pop());
        }
    }

    // Just log results - let original system handle notifications
    if (successCount === totalFiles) {
        console.log(`Successfully moved ${totalFiles} item${totalFiles > 1 ? 's' : ''}`);
        return Promise.resolve();
    } else if (successCount > 0) {
        console.log(`Moved ${successCount}/${totalFiles} items. Failed: ${failedFiles.join(', ')}`);
        return Promise.resolve();
    } else {
        console.error(`Failed to move items: ${failedFiles.join(', ')}`);
        return Promise.reject(new Error(`Failed to move items: ${failedFiles.join(', ')}`));
    }
}

// Check if path is a descendant
function isDescendantPath(parentPath, childPath) {
    if (!childPath) return false;
    if (parentPath === childPath) return true;
    return childPath.startsWith(parentPath + '/');
}

async function performMove(sourcePath, targetDirectoryPath, isDirectory) {
    try {
        // Protect important system files from deletion
        const protectedFiles = ['editer.html', 'editer.js', 'editer.css', 'server.js', 'package.json'];
        const fileName = sourcePath.split('/').pop();
        
        if (protectedFiles.includes(fileName)) {
            const shouldMove = confirm(
                `"${fileName}" is an important system file. Do you really want to move it?`
            );
            if (!shouldMove) {
                return;
            }
        }
        
        const newPath = targetDirectoryPath + '/' + fileName;
        
        // Check if item with same name already exists in target directory
        const existingItems = await loadDirectory(targetDirectoryPath);
        if (existingItems.success) {
            const nameExists = existingItems.data.contents.some(item => item.name === fileName);
            if (nameExists) {
                const shouldContinue = confirm(
                    `A ${isDirectory ? 'folder' : 'file'} with the same name "${fileName}" already exists in "${targetDirectoryPath}". ` +
                    'Do you want to overwrite it?'
                );
                if (!shouldContinue) {
                    return;
                }
            }
        }
        
        // Show loading state
        showMoveProgress(sourcePath, targetDirectoryPath);
        
        // Call the rename API (which handles both rename and move)
        const response = await fetch('/edit/creator/_api/rename', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                oldPath: sourcePath,
                newPath: newPath
            })
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        hideMoveProgress();
        
        if (result.success) {
            // Update expanded directories if moving a directory that was expanded
            if (isDirectory && expandedDirs.has(sourcePath)) {
                expandedDirs.delete(sourcePath);
                expandedDirs.add(newPath);
                
                // Update any nested expanded directories
                const expandedPaths = Array.from(expandedDirs);
                expandedPaths.forEach(expandedPath => {
                    if (expandedPath.startsWith(sourcePath + '/')) {
                        const newExpandedPath = expandedPath.replace(sourcePath, newPath);
                        expandedDirs.delete(expandedPath);
                        expandedDirs.add(newExpandedPath);
                    }
                });
            }
            
            // Update current file path if it was moved
            try {
                if (state && state.activeFilePath && (state.activeFilePath === sourcePath || state.activeFilePath.startsWith(sourcePath + '/'))) {
                    const newFileName = state.activeFilePath.replace(sourcePath, newPath);
                    if (state.hasOwnProperty('activeFilePath')) {
                        state.activeFilePath = newFileName;
                    }
                }
            } catch (error) {
                console.warn('Could not update activeFilePath:', error.message);
            }
            
            // Refresh the file tree
            await refreshFileTree();

            // Individual success messages removed to reduce toast spam
            console.log(`Successfully moved ${isDirectory ? 'folder' : 'file'} "${fileName}" to "${targetDirectoryPath}"`);
        } else {
            throw new Error(result.error || 'Received failure response from API');
        }
        
    } catch (error) {
        console.error('performMove error:', error);
        hideMoveProgress();
        // Let original system handle error notifications
    }
}

function showMoveProgress(sourcePath, targetPath) {
    // Progress messages removed to reduce toast spam - now only shown in console
    const fileName = sourcePath.split('/').pop();
    const targetName = targetPath === '.' ? 'root' : targetPath.split('/').pop();
    console.log(`Moving "${fileName}" to "${targetName}"...`);
}

function hideMoveProgress() {
    // Using the new message system, auto-hide is handled
}

function showMoveMessage(message, type = 'success') {
    // Disabled to avoid conflicting with original notifications
    console.log(`Move message (${type}):`, message);
}


function expandToCurrentFile(filePath) {
    if (!filePath || filePath === '.') return;
    const pathParts = filePath.split('/');
    pathParts.pop();
    let currentPath = '';
    for (let i = 0; i < pathParts.length; i++) {
        currentPath = i === 0 ? pathParts[i] : currentPath + '/' + pathParts[i];
        expandedDirs.add(currentPath);
    }
}

async function refreshFileTree() {
    const fileTree = document.getElementById('file-tree');
    
    if (!fileTree) {
        console.error('File tree element not found');
        return;
    }
    
    if (state && state.activeFilePath) {
        expandToCurrentFile(state.activeFilePath);
    }
    
    try {
        const response = await loadDirectory('.');
        
        if (response.success) {
            fileTree.innerHTML = createFileTreeHTML(response.data.contents);
            attachFileTreeEvents();
            await loadExpandedDirectoriesSequentially();
            // Defensive: if any expanded folder is still showing loading, kick retries.
            kickStuckExpandedLoads();
        } else {
            console.error('Directory loading failed:', response);
            fileTree.innerHTML = '<li class="error">Unable to load files</li>';
        }
    } catch (error) {
        console.error('File tree refresh error:', error);
        fileTree.innerHTML = '<li class="error">Error occurred while loading files</li>';
    }
}

async function loadExpandedDirectoriesSequentially() {
    // Depth-first ensures parent folders are rendered before children loads run.
    const expandedPaths = Array.from(expandedDirs).sort((a, b) => {
        const da = a.split('/').length;
        const db = b.split('/').length;
        if (da !== db) return da - db;
        return a.localeCompare(b);
    });
    for (const dirPath of expandedPaths) {
        await loadDirectoryContents(dirPath);
        // Removed artificial 50ms delay for better performance
    }
    // Reduced timeout from 100ms to 10ms for snappier UI
    setTimeout(() => {
        updateFileTreeActiveState();
    }, 10);
}

function updateFileTreeActiveState() {
    const filePath = state.activeFilePath;

    const fileItems = document.querySelectorAll('.file-item');
    fileItems.forEach(item => item.classList.remove('active'));
    const currentFileItem = document.querySelector('.file-item[data-path="' + filePath + '"]');
    if (currentFileItem) {
        currentFileItem.classList.add('active');   
        currentFileItem.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
        });
    }

}

async function loadDirectoryContents(dirPath) {
    // Track the latest request per dirPath so older responses don't overwrite newer DOM.
    const nextVersion = (dirLoadVersion.get(dirPath) || 0) + 1;
    dirLoadVersion.set(dirPath, nextVersion);

    let nestedList = ensureNestedListExists(dirPath);
    if (!nestedList) {
        scheduleLoadRetry(dirPath);
        return;
    }
    try {
        const response = await loadDirectory(dirPath);
        if (response.success) {
            // If the tree was refreshed while we were loading, ensure we update the current DOM node.
            if (dirLoadVersion.get(dirPath) !== nextVersion) return;
            if (!expandedDirs.has(dirPath)) return;

            nestedList = ensureNestedListExists(dirPath);
            if (!nestedList) {
                scheduleLoadRetry(dirPath);
                return;
            }

            nestedList.innerHTML = createFileTreeHTML(response.data.contents, dirPath);
            dirLoadRetryCount.delete(dirPath);
            // After rendering a directory, some children may have been created in loading state.
            // Kick retries so deep expansions (e.g. active file path) don't get stuck.
            kickStuckExpandedLoads(nestedList);
            // Set tabindex for keyboard navigation on new file items only
            const newFileItems = nestedList.querySelectorAll('.file-item');
            newFileItems.forEach(item => {
                item.setAttribute('tabindex', '0');
            });
            // No need to re-attach events - event delegation handles this!
        } else {
            nestedList.innerHTML = '<li class="error">Error loading directory</li>';
        }
    } catch (error) {
        console.error('Error loading directory:', error);
        nestedList.innerHTML = '<li class="error">Error loading directory</li>';
    }
}

function attachFileTreeEvents() {
    const fileTree = document.getElementById('file-tree');
    const container = document.getElementById('file-tree-container');
    
    if (!fileTree || !container) return;
    
    // Remove any existing listeners first to prevent duplicates
    fileTree.removeEventListener('click', handleTreeClick);
    fileTree.removeEventListener('contextmenu', handleTreeContextMenu);
    fileTree.removeEventListener('keydown', handleTreeKeydown);
    fileTree.removeEventListener('dragstart', onDragStart);
    fileTree.removeEventListener('dragover', onDragOver);
    fileTree.removeEventListener('dragenter', onDragEnter);
    fileTree.removeEventListener('dragleave', onDragLeave);
    fileTree.removeEventListener('drop', onDrop);
    fileTree.removeEventListener('dragend', onDragEnd);

    // Remove mobile touch event listeners
    fileTree.removeEventListener('touchstart', onTouchStart);
    fileTree.removeEventListener('touchmove', onTouchMove);
    fileTree.removeEventListener('touchend', onTouchEnd);

    container.removeEventListener('dragover', onDragOver, true);
    container.removeEventListener('dragenter', onDragEnter, true);
    container.removeEventListener('dragleave', onDragLeave, true);
    container.removeEventListener('drop', onDrop, true);
    
    // Add event listeners for file tree
    fileTree.addEventListener('click', handleTreeClick);
    fileTree.addEventListener('contextmenu', handleTreeContextMenu);
    fileTree.addEventListener('keydown', handleTreeKeydown);
    
    // Enable drag and drop for mobile (with long press) and activate touch events
    if (isMobileDevice()) {
        fileTree.addEventListener('touchstart', onTouchStart, { passive: true });
        fileTree.addEventListener('touchmove', onTouchMove, { passive: false });
        fileTree.addEventListener('touchend', onTouchEnd, { passive: false });
    } else {
        // Simple drag/drop setup
        console.log('=== Setting up SIMPLE drag/drop ===');

        fileTree.addEventListener('dragstart', onDragStart);
        fileTree.addEventListener('dragover', onDragOver);
        fileTree.addEventListener('drop', onDrop);
        fileTree.addEventListener('dragend', onDragEnd);

        console.log('=== Simple drag/drop ready ===');
    }
    
    // Set tabindex for keyboard navigation on all file items
    const fileItems = fileTree.querySelectorAll('.file-item');
    fileItems.forEach(item => {
        item.setAttribute('tabindex', '0');
    });
}

function handleTreeClick(e) {
    // Handle more options button click
    const moreBtn = e.target.closest('.more-options-btn');
    if (moreBtn) {
        e.preventDefault();
        e.stopPropagation();
        const path = moreBtn.getAttribute('data-path');
        const isDirectory = moreBtn.getAttribute('data-is-directory') === 'true';
        
        // Create event object (based on more options button position)
        // Set position so menu appears to the left of button
        const rect = moreBtn.getBoundingClientRect();
        const syntheticEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
            clientX: rect.right, // Right edge of button
            clientY: rect.top, // Top of button
            target: moreBtn
        };
        
        if (isDirectory) {
            state.context.showDirectoryMenu(syntheticEvent, path);
        } else {
            state.context.showFileMenu(syntheticEvent, path);
        }
        return;
    }
    
    const fileItem = e.target.closest('.file-item');
    if (!fileItem) return;
    
    // Prevent clicks caused by touch events on mobile
    if (isMobileDevice() && e.type === 'click' && Date.now() - touchStartTime < 300) {
        return;
    }
    
    e.preventDefault();
    const path = fileItem.getAttribute('data-path');
    const isDirectory = fileItem.getAttribute('data-is-directory') === 'true';
    
    const allFileItems = Array.from(getFileTreeScope().querySelectorAll('.file-item'));

    if (e.shiftKey && selectionAnchorPath) {
        const anchorIndex = allFileItems.findIndex(item => item.getAttribute('data-path') === selectionAnchorPath);
        const currentIndex = allFileItems.indexOf(fileItem);

        if (anchorIndex !== -1 && currentIndex !== -1) {
            allFileItems.forEach(item => item.classList.remove('active'));
            const start = Math.min(anchorIndex, currentIndex);
            const end = Math.max(anchorIndex, currentIndex);
            for (let i = start; i <= end; i++) {
                allFileItems[i].classList.add('active');
            }
        }
    } else if (e.ctrlKey || e.metaKey) {
        fileItem.classList.toggle('active');
        if (fileItem.classList.contains('active')) {
            selectionAnchorPath = path;
        } else if (selectionAnchorPath === path) {
            const firstActive = allFileItems.find(item => item.classList.contains('active'));
            selectionAnchorPath = firstActive ? firstActive.getAttribute('data-path') : null;
        }
    } else {
        // Normal click
        allFileItems.forEach(item => item.classList.remove('active'));
        fileItem.classList.add('active');
        selectionAnchorPath = path;

        if (isDirectory) {
            toggleDirectory(fileItem, path);
        } else {
            openFileInEditor(path);
        }
    }
}

function handleTreeContextMenu(e) {
    const fileItem = e.target.closest('.file-item');
    if (!fileItem) return;
    
    e.preventDefault();

    if (!fileItem.classList.contains('active')) {
        const allFileItems = Array.from(getFileTreeScope().querySelectorAll('.file-item'));
        allFileItems.forEach(item => item.classList.remove('active'));
        fileItem.classList.add('active');
        selectionAnchorPath = fileItem.getAttribute('data-path');
    }

    const selectedItems = Array.from(getFileTreeScope().querySelectorAll('.file-item.active'));
    const selection = selectedItems.map(item => ({
        path: item.getAttribute('data-path'),
        isDirectory: item.getAttribute('data-is-directory') === 'true'
    }));

    const path = fileItem.getAttribute('data-path');
    const isDirectory = fileItem.getAttribute('data-is-directory') === 'true';
    
    if (isDirectory) {
        state.context.showDirectoryMenu(e, path, selection);
    } else {
        state.context.showFileMenu(e, path, selection);
    }
}

function handleTreeKeydown(e) {
    const fileItem = e.target.closest('.file-item');
    if (!fileItem) return;
    
    const path = fileItem.getAttribute('data-path');
    const isDirectory = fileItem.getAttribute('data-is-directory') === 'true';
    
    if (e.key === 'Delete') {
        e.preventDefault();
        confirmDelete(path, isDirectory);
    } else if (e.key === 'F2') {
        e.preventDefault();
        confirmRename(path, isDirectory);
    } else if (e.key === 'd' && e.ctrlKey) {
        e.preventDefault();
        confirmDuplicate(path, isDirectory);
    }
}

function handleTreeMouseDown(e) {
    if (e.shiftKey) {
        e.preventDefault();
    }
}

function toggleDirectory(fileItem, path) {
    const expandIcon = fileItem.querySelector('.expand-icon');
    // file-item-wrapper -> li 구조이므로 부모의 부모를 찾아야 함
    const liElement = fileItem.closest('li');
    const nestedList = liElement ? getNestedListByPath(path, liElement) : null;
    
    if (expandedDirs.has(path)) {
        // Collapse directory
        expandedDirs.delete(path);
        expandIcon.classList.remove('expanded');
        if (nestedList) {
            nestedList.classList.remove('expanded');
            nestedList.style.display = 'none';
        }
    } else {
        // Expand directory
        expandedDirs.add(path);
        expandIcon.classList.add('expanded');
        if (nestedList) {
            nestedList.classList.add('expanded');
            nestedList.style.display = 'block';
            loadDirectoryContents(path);
            scheduleLoadRetry(path);
        } else {
            const nestedHtml = '<ul class="nested-files expanded" data-path="' + path + '">' +
                '<li class="loading"></li></ul>';
            if (liElement) {
                liElement.insertAdjacentHTML('beforeend', nestedHtml);
                loadDirectoryContents(path);
                scheduleLoadRetry(path);
            }
        }
    }
}

async function openFileInEditor(filePath) {
    state.layout.activePane.addTab(filePath);
}

/**
 * Open a terminal in the specified directory
 * @param {string} path - The path to open in terminal
 * @param {boolean} isDirectory - Whether the path is a directory
 */
async function openInTerminal(path, isDirectory, workspaceRoot) {    
    try {
        // Determine the directory to open in terminal
        let targetDirectory;
        if (isDirectory) {
            targetDirectory = path;
        } else {
            // For files, use the parent directory
            const pathParts = path.split('/');
            pathParts.pop(); // Remove the filename
            targetDirectory = pathParts.join('/') || '.';
        }
        
        // Get the absolute path for the terminal
        const absolutePath = workspaceRoot + '/' + targetDirectory;
        
        // Create terminal URL with the specified directory
        const terminalUrl = `/terminal?cwd=${encodeURIComponent(absolutePath)}`;
        
        // Create a temporary anchor element to open in new tab
        const link = document.createElement('a');
        link.href = terminalUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer'; // Security best practice
        link.style.display = 'none';
        
        // Add to DOM, click it, then remove it
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage(`Opening terminal in: ${targetDirectory}`, 'success');
        
    } catch (error) {
        console.error('Failed to open terminal:', error);
        showMessage('Failed to open terminal', 'error');
    }
}

function confirmDelete(path, isDirectory) {
    // Protect important system files from deletion
    const protectedFiles = ['editer.html', 'editer.js', 'editer.css', 'server.js', 'package.json'];
    const fileName = path.split('/').pop();
    
    if (protectedFiles.includes(fileName)) {
        alert(`"${fileName}" is an important system file and cannot be deleted.`);
        return;
    }
    
    const itemType = isDirectory ? 'folder' : 'file';
    const message = `Are you sure you want to delete this ${itemType}?\n\n${path}`;
    
    if (isDirectory) {
        const recursiveMessage = message + '\n\nThis operation will permanently delete the folder and all its contents.';
        if (confirm(recursiveMessage)) performDelete(path, isDirectory, true);
    } else {
        if (confirm(message)) performDelete(path, isDirectory, false);
    }
}
async function performDelete(path, isDirectory, recursive = false) {
    try {
        const response = isDirectory ? await deleteFolder(path, recursive) : await deleteFile(path);
        if (response.success) {
            await refreshFileTree();
        } else {
            alert(`Failed to delete ${isDirectory ? 'folder' : 'file'}: ${response.error}`);
        }
    } catch (error) {
        alert(`Error deleting ${isDirectory ? 'folder' : 'file'}: ${error.message}`);
    }
}

async function confirmDeleteMultiple(selection) {
    const message = `Are you sure you want to permanently delete these ${selection.length} items?`;
    if (confirm(message)) {
        for (const item of selection) {
            await performDelete(item.path, item.isDirectory, item.isDirectory, false);
        }
        await refreshFileTree();
    }
}

function confirmRename(path, isDirectory) {
    showRenameModal(path, isDirectory);
}

function showRenameModal(path, isDirectory) {
    if (!path) return;
    const currentName = path.split('/').pop();
    const basePath = path.substring(0, path.lastIndexOf('/')) || '';
    renameModalState = { oldPath: path, isDirectory, currentName, basePath };

    const titleEl = document.getElementById('rename-item-title');
    const labelEl = document.getElementById('rename-item-label');
    const hintEl = document.getElementById('rename-item-hint');
    const inputEl = document.getElementById('rename-item-name');
    const submitBtn = document.getElementById('rename-item-submit');

    if (titleEl) titleEl.textContent = isDirectory ? 'Rename Folder' : 'Rename File';
    if (labelEl) labelEl.textContent = isDirectory ? 'Folder Name' : 'File Name';
    if (hintEl) hintEl.textContent = basePath ? `Path: ${basePath}/` : 'Path: /';
    if (submitBtn) submitBtn.textContent = isDirectory ? 'Rename Folder' : 'Rename File';
    if (inputEl) {
        inputEl.value = currentName;
        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 0);
    }

    showModal('rename-item-modal');
}
async function performRename(oldPath, newPath, isDirectory) {
    try {
        const response = await renameItem(oldPath, newPath);
        if (response.success) {
			// Optimistically notify listeners so tabs/preview update immediately.
			qoomEvent.emit('fileRenamed', { oldPath, newPath, source: 'explorer' });
        } else {
            alert(`Failed to rename ${isDirectory ? 'folder' : 'file'}: ${response.error}`);
        }
    } catch (error) {
        alert(`Error renaming ${isDirectory ? 'folder' : 'file'}: ${error.message}`);
    }
}

function confirmDuplicate(path, isDirectory) {
    showDuplicateModal(path, isDirectory);
}

function showDuplicateModal(path, isDirectory) {
    if (!path) return;
    const originalName = path.split('/').pop();
    const basePath = path.substring(0, path.lastIndexOf('/')) || '';
    const extension = isDirectory ? '' : (originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '');
    const nameWithoutExt = isDirectory ? originalName : (originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName);
    const defaultDuplicateName = `${nameWithoutExt}_copy${extension}`;

    duplicateModalState = { sourcePath: path, isDirectory, basePath, defaultDuplicateName };

    const titleEl = document.getElementById('duplicate-item-title');
    const labelEl = document.getElementById('duplicate-item-label');
    const hintEl = document.getElementById('duplicate-item-hint');
    const inputEl = document.getElementById('duplicate-item-name');
    const submitBtn = document.getElementById('duplicate-item-submit');

    if (titleEl) titleEl.textContent = isDirectory ? 'Duplicate Folder' : 'Duplicate File';
    if (labelEl) labelEl.textContent = isDirectory ? 'Folder Name' : 'File Name';
    if (hintEl) hintEl.textContent = basePath ? `Path: ${basePath}/` : 'Path: /';
    if (submitBtn) submitBtn.textContent = isDirectory ? 'Duplicate Folder' : 'Duplicate File';
    if (inputEl) {
        inputEl.value = defaultDuplicateName;
        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 0);
    }

    showModal('duplicate-item-modal');
}
async function performDuplicate(sourcePath, targetPath, isDirectory) {
    try {
        const response = isDirectory ? await duplicateFolder(sourcePath, targetPath) : await duplicateFile(sourcePath, targetPath);
        if (response.success) {
            await refreshFileTree();
            if (!isDirectory) {
                openFileInEditor(targetPath);
            }
        } else {
            alert(`Failed to duplicate ${isDirectory ? 'folder' : 'file'}: ${response.error}`);
        }
    } catch (error) {
        alert(`Error duplicating ${isDirectory ? 'folder' : 'file'}: ${error.message}`);
    }
}

async function createFileInFolder(folderPath) {
    contextMenuTargetFolder = folderPath;
    showModal('create-file-modal');
}
async function createFolderInFolder(folderPath) {
    contextMenuTargetFolder = folderPath;
    showModal('create-folder-modal');
}

// --- Upload/drag-and-drop ---

function setupDragAndDrop() {
    console.log('=== External drag/drop setup DISABLED for testing ===');
    return; // COMPLETELY DISABLE external handlers for now

    // DISABLED body handlers for testing
    console.log('=== Body level handlers DISABLED ===');

    // Global handlers DISABLED for testing


    function highlight() {
        explorerContent.classList.add('drag-over');
        // Add visual feedback message
        if (!document.querySelector('.drop-hint')) {
            const hint = document.createElement('div');
            hint.className = 'drop-hint';
            hint.textContent = 'Drop files here to upload';
            explorerContent.appendChild(hint);
        }
    }

    function unhighlight() {
        explorerContent.classList.remove('drag-over');
        // Remove visual feedback message
        const hint = document.querySelector('.drop-hint');
        if (hint) {
            hint.remove();
        }
    }

    async function handleDrop(e) {
        console.log('=== External handleDrop called ===', {
            draggedData,
            hasDraggedData: !!draggedData
        });

        // Check if this is an internal drag (let onDrop handle it)
        if (draggedData) {
            console.log('=== External drop handler: ignoring internal drag, not preventing defaults ===');
            // DON'T prevent defaults - let the internal handler process it
            return; // Let the onDrop function handle internal moves
        }

        // Only prevent defaults for external drops
        e.preventDefault();
        e.stopPropagation();

        dragCounter = 0; // Reset counter on drop
        unhighlight();

        const dt = e.dataTransfer;
        const items = dt.items;
        const files = [];

        // Handle both files and folders
        if (items) {
            // Use DataTransferItemList interface when available
            const entries = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file') {
                    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : item.getAsFile();
                    if (entry) {
                        entries.push(entry);
                    }
                }
            }

            // Process entries (could be files or directories)
            for (const entry of entries) {
                if (entry.isFile || entry instanceof File) {
                    // It's a file
                    if (entry.file) {
                        await new Promise((resolve) => {
                            entry.file((file) => {
                                files.push(file);
                                resolve();
                            });
                        });
                    } else {
                        files.push(entry);
                    }
                } else if (entry.isDirectory) {
                    // It's a directory - recursively get all files
                    const dirFiles = await readDirectory(entry);
                    files.push(...dirFiles);
                }
            }
        } else {
            // Fallback to FileList
            for (let i = 0; i < dt.files.length; i++) {
                files.push(dt.files[i]);
            }
        }

        if (files.length > 0) {
            handleFileUpload(files);
        }
    }

    // Helper function to recursively read directory contents
    async function readDirectory(dirEntry, path = '') {
        const files = [];
        const reader = dirEntry.createReader();

        // Read entries in batches
        let entries = [];
        let batch;
        do {
            batch = await new Promise((resolve) => {
                reader.readEntries(resolve);
            });
            entries = entries.concat(batch);
        } while (batch.length > 0);

        for (const entry of entries) {
            const entryPath = path ? `${path}/${entry.name}` : entry.name;

            if (entry.isFile) {
                const file = await new Promise((resolve) => {
                    entry.file((file) => {
                        // Preserve the relative path
                        Object.defineProperty(file, 'webkitRelativePath', {
                            value: `${dirEntry.name}/${entryPath}`,
                            writable: false
                        });
                        resolve(file);
                    });
                });
                files.push(file);
            } else if (entry.isDirectory) {
                const subFiles = await readDirectory(entry, entryPath);
                // Update paths for nested files
                subFiles.forEach(file => {
                    if (!file.webkitRelativePath.startsWith(dirEntry.name)) {
                        Object.defineProperty(file, 'webkitRelativePath', {
                            value: `${dirEntry.name}/${file.webkitRelativePath || file.name}`,
                            writable: false
                        });
                    }
                });
                files.push(...subFiles);
            }
        }

        return files;
    }
}
async function handleFileUpload(files) {
    if (!files || files.length === 0) {
        return;
    }

    // Show initial upload message
    const fileCount = files.length;
    showUploadMessage(`Processing ${fileCount} file${fileCount > 1 ? 's' : ''}...`, 'info');

    const filesToUpload = [];
    const errors = [];

    // Process files in parallel with Promise.all
    const filePromises = Array.from(files).map((file, index) => {
        return new Promise((resolve, reject) => {
            // Skip files larger than 50MB for better performance
            const maxSize = 50 * 1024 * 1024; // 50MB
            if (file.size > maxSize) {
                errors.push(`${file.name}: File too large (max 50MB)`);
                resolve(null);
                return;
            }

            const reader = new FileReader();

            reader.onload = function(e) {
                try {
                    const base64Content = e.target.result.split(',')[1];
                    const fileName = file.webkitRelativePath || file.name;

                    // Check for duplicate file names and rename if necessary
                    let finalFileName = fileName;
                    let counter = 1;
                    while (filesToUpload.some(f => f.fileName === finalFileName)) {
                        const nameParts = fileName.split('.');
                        if (nameParts.length > 1) {
                            const ext = nameParts.pop();
                            finalFileName = `${nameParts.join('.')}_${counter}.${ext}`;
                        } else {
                            finalFileName = `${fileName}_${counter}`;
                        }
                        counter++;
                    }

                    resolve({ fileName: finalFileName, fileContent: base64Content });
                } catch (error) {
                    console.error(`Error processing file ${file.name}:`, error);
                    errors.push(`${file.name}: ${error.message}`);
                    resolve(null);
                }
            };

            reader.onerror = function(error) {
                console.error(`FileReader error for ${file.name}:`, error);
                errors.push(`${file.name}: Failed to read file`);
                resolve(null);
            };

            // Add timeout for file reading
            const timeout = setTimeout(() => {
                reader.abort();
                errors.push(`${file.name}: Reading timeout`);
                resolve(null);
            }, 30000); // 30 second timeout per file

            reader.onloadend = () => {
                clearTimeout(timeout);
            };

            reader.readAsDataURL(file);
        });
    });

    try {
        const results = await Promise.all(filePromises);

        // Filter out null results (failed files)
        results.forEach(result => {
            if (result) {
                filesToUpload.push(result);
            }
        });

        // Show errors if any
        if (errors.length > 0) {
            showUploadMessage(`Failed to process ${errors.length} file(s). Check console for details.`, 'error');
            console.error('File processing errors:', errors);
        }

        // Upload successfully processed files
        if (filesToUpload.length > 0) {
            showUploadMessage(`Uploading ${filesToUpload.length} file${filesToUpload.length > 1 ? 's' : ''}...`, 'info');
            await uploadFiles(filesToUpload);
        } else {
            showUploadMessage('No files to upload', 'warning');
        }
    } catch (error) {
        console.error('Error processing files:', error);
        showUploadMessage(`Failed to process files: ${error.message}`, 'error');
    }
}
async function uploadFiles(files, targetPath = null) {
    const uploadPath = targetPath || getCurrentDirectory();
    
    showUploadProgress(files.length);
    
    try {
        const requestBody = { files: files, targetPath: uploadPath };
        
        const response = await fetch('/edit/uploader/_api/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        hideUploadProgress();
        
        if (data.success) {
            await refreshFileTree();
            const pathMessage = uploadPath === '.' ? 'root directory' : `folder "${uploadPath}"`;
            showUploadMessage(`Successfully uploaded ${files.length} files to ${pathMessage}!`);
        } else {
            console.error('Upload failed:', data.message);
            throw new Error(data.message || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        hideUploadProgress();
        showUploadMessage(`Upload failed: ${error.message}`, 'error');
    }
}
let uploadProgressContainer = null;
let uploadProgressTimeout = null;

function showUploadProgress(fileCount, currentFile = 0) {
    // Remove existing progress container if any
    if (uploadProgressContainer) {
        uploadProgressContainer.remove();
    }

    const progressDiv = document.createElement('div');
    progressDiv.id = 'upload-progress';
    progressDiv.className = 'upload-progress-container';

    const percentage = fileCount > 0 ? Math.round((currentFile / fileCount) * 100) : 0;

    progressDiv.innerHTML = `
        <div class="upload-progress-header">
            <span class="upload-progress-title">
                <i class="codicon codicon-cloud-upload"></i>
                Uploading ${currentFile}/${fileCount} file${fileCount !== 1 ? 's' : ''}
            </span>
            <button class="upload-progress-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
        <div class="upload-progress-bar">
            <div class="upload-progress-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="upload-progress-info">${percentage}% complete</div>
    `;

    document.body.appendChild(progressDiv);
    uploadProgressContainer = progressDiv;

    // Auto-hide after upload completes
    if (percentage === 100) {
        uploadProgressTimeout = setTimeout(() => {
            hideUploadProgress();
        }, 2000);
    }
}

function updateUploadProgress(fileCount, currentFile) {
    if (!uploadProgressContainer) {
        showUploadProgress(fileCount, currentFile);
        return;
    }

    const percentage = Math.round((currentFile / fileCount) * 100);
    const progressFill = uploadProgressContainer.querySelector('.upload-progress-fill');
    const progressInfo = uploadProgressContainer.querySelector('.upload-progress-info');
    const progressTitle = uploadProgressContainer.querySelector('.upload-progress-title');

    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }
    if (progressInfo) {
        progressInfo.textContent = `${percentage}% complete`;
    }
    if (progressTitle) {
        progressTitle.innerHTML = `
            <i class="codicon codicon-cloud-upload"></i>
            Uploading ${currentFile}/${fileCount} file${fileCount !== 1 ? 's' : ''}
        `;
    }

    // Auto-hide when complete
    if (percentage === 100) {
        uploadProgressTimeout = setTimeout(() => {
            hideUploadProgress();
        }, 2000);
    }
}

function hideUploadProgress() {
    if (uploadProgressTimeout) {
        clearTimeout(uploadProgressTimeout);
        uploadProgressTimeout = null;
    }
    if (uploadProgressContainer) {
        // Add fade-out animation
        uploadProgressContainer.style.animation = 'slide-down 0.3s ease';
        setTimeout(() => {
            if (uploadProgressContainer) {
                uploadProgressContainer.remove();
                uploadProgressContainer = null;
            }
        }, 300);
    }
}

let messageQueue = [];
let messageContainer = null;

function showUploadMessage(message, type = 'success') {
    // Create message container if it doesn't exist
    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.className = 'upload-messages-container';
        messageContainer.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10001;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-width: 350px;
        `;
        document.body.appendChild(messageContainer);
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `upload-message upload-message-${type}`;

    // Choose icon based on type
    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };
    const icon = icons[type] || icons.info;

    messageDiv.innerHTML = `
        <span class="upload-message-icon">${icon}</span>
        <span class="upload-message-text">${message}</span>
        <button class="upload-message-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    // Style the message
    const colors = {
        success: 'linear-gradient(135deg, #28a745, #20c997)',
        error: 'linear-gradient(135deg, #dc3545, #ff6b6b)',
        warning: 'linear-gradient(135deg, #ffc107, #ffb347)',
        info: 'linear-gradient(135deg, #17a2b8, #3498db)'
    };

    messageDiv.style.cssText = `
        background: ${colors[type]};
        color: white;
        padding: 10px 15px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slide-in 0.3s ease;
        position: relative;
        min-width: 250px;
    `;

    const iconSpan = messageDiv.querySelector('.upload-message-icon');
    if (iconSpan) {
        iconSpan.style.cssText = `
            font-size: 16px;
            font-weight: bold;
        `;
    }

    const textSpan = messageDiv.querySelector('.upload-message-text');
    if (textSpan) {
        textSpan.style.cssText = `
            flex: 1;
        `;
    }

    const closeBtn = messageDiv.querySelector('.upload-message-close');
    if (closeBtn) {
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            cursor: pointer;
            padding: 0;
            margin-left: 10px;
            opacity: 0.8;
            transition: opacity 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
        closeBtn.onmouseout = () => closeBtn.style.opacity = '0.8';
    }

    messageContainer.appendChild(messageDiv);

    // Auto-remove after timeout
    const timeout = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
        messageDiv.style.animation = 'slide-out 0.3s ease';
        setTimeout(() => {
            messageDiv.remove();
            // Remove container if empty
            if (messageContainer && messageContainer.children.length === 0) {
                messageContainer.remove();
                messageContainer = null;
            }
        }, 300);
    }, timeout);
}
function getCurrentDirectory() {
    return '.';
}
function uploadFilesToFolder(folderPath) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUploadToFolder(e.target.files, folderPath);
        }
        fileInput.remove();
    });
    document.body.appendChild(fileInput);
    fileInput.click();
}
function uploadFolderToFolder(folderPath) {
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.webkitdirectory = true;
    folderInput.directory = true;
    folderInput.style.display = 'none';
    folderInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUploadToFolder(e.target.files, folderPath);
        }
        folderInput.remove();
    });
    document.body.appendChild(folderInput);
    folderInput.click();
}
function handleFileUploadToFolder(files, targetPath) {
    if (!files || files.length === 0) return;
    
    const filesToUpload = [];
    let folderName = null;
    
    // Extract the root folder name from the first file's webkitRelativePath
    if (files[0].webkitRelativePath) {
        const pathParts = files[0].webkitRelativePath.split('/');
        folderName = pathParts[0]; // Get the root folder name
    }
    
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Content = e.target.result.split(',')[1];
            
            let fileName;
            if (file.webkitRelativePath && folderName) {
                // Remove the root folder name from the path and use the rest
                const pathParts = file.webkitRelativePath.split('/');
                pathParts.shift(); // Remove the first part (root folder name)
                fileName = pathParts.join('/') || file.name;
            } else {
                fileName = file.name;
            }
            
            filesToUpload.push({ fileName: fileName, fileContent: base64Content });
            
            if (filesToUpload.length === files.length) {
                // If we have a folder name, create the folder first, then upload files to it
                if (folderName) {
                    const newFolderPath = targetPath === '.' ? folderName : `${targetPath}/${folderName}`;
                    
                    // Create the folder first
                    fetch('/edit/creator/_api/folder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folderPath: newFolderPath })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            // Upload files to the newly created folder
                            uploadFiles(filesToUpload, newFolderPath);
                        } else {
                            throw new Error(data.message || 'Failed to create folder');
                        }
                    })
                    .catch(error => {
                        showUploadMessage(`Failed to create folder: ${error.message}`, 'error');
                    });
                } else {
                    // No folder structure, upload files directly
                    uploadFiles(filesToUpload, targetPath);
                }
            }
        };
        reader.readAsDataURL(file);
    });
}

function downloadFile(filePath) {
    try {
        // Create a temporary link element to trigger download
        const link = document.createElement('a');
        link.href = `/view/${filePath}`;
        link.download = filePath.split('/').pop(); // Get filename from path
        link.style.display = 'none';
        
        // Add appropriate headers to force download
        link.target = '_blank';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('Download started', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showMessage('Failed to download file: ' + error.message, 'error');
    }
}

async function downloadFolder(folderPath) {
    try {
        showMessage('Preparing folder download...', 'info');
        
        // Call the new download API endpoint
        const response = await fetch('/editer/explorer/_api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                path: folderPath,
                type: 'folder'
            })
        });

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }

        // Get the filename from the response headers or create one
        const contentDisposition = response.headers.get('content-disposition');
        let filename = `${folderPath.split('/').pop() || 'folder'}.zip`;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }

        // Create blob and download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the blob URL
        window.URL.revokeObjectURL(url);
        
        showMessage('Folder download completed', 'success');
    } catch (error) {
        console.error('Folder download error:', error);
        showMessage('Failed to download folder: ' + error.message, 'error');
    }
}

async function downloadMultiple(selection) {
    if (!selection || selection.length === 0) return;
    try {
        showMessage(`Preparing download of ${selection.length} items...`, 'info');
        const response = await fetch('/editer/explorer/_api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'multiple',
                paths: selection
            })
        });
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'download.zip';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        showMessage(`Download completed (${selection.length} items)`, 'success');
    } catch (error) {
        console.error('Multiple download error:', error);
        showMessage('Failed to download: ' + error.message, 'error');
    }
}

// --- Modal and header events ---

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        const firstInput = modal.querySelector('input');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);
    }
}
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        const inputs = modal.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.type === 'text' || input.tagName === 'TEXTAREA') {
                input.value = '';
            } else if (input.tagName === 'SELECT') {
                input.selectedIndex = 0;
            }
        });

        if (modalId === 'create-file-modal' || modalId === 'create-folder-modal') {
            contextMenuTargetFolder = null;
        }
        if (modalId === 'rename-item-modal') {
            renameModalState = null;
            const hintEl = document.getElementById('rename-item-hint');
            if (hintEl) hintEl.textContent = '';
        }
        if (modalId === 'duplicate-item-modal') {
            duplicateModalState = null;
            const hintEl = document.getElementById('duplicate-item-hint');
            if (hintEl) hintEl.textContent = '';
        }
    }
}
function setupModalEvents() {
    const createFileBtn = document.getElementById('create-file-btn');
    const createFileClose = document.getElementById('create-file-close');
    const createFileCancel = document.getElementById('create-file-cancel');
    const createFileSubmit = document.getElementById('create-file-submit');
    const fileTemplateSelect = document.getElementById('file-template');
    const fileContentTextarea = document.getElementById('file-content');
    if (createFileBtn) createFileBtn.addEventListener('click', () => showModal('create-file-modal'));
    if (createFileClose) createFileClose.addEventListener('click', () => hideModal('create-file-modal'));
    if (createFileCancel) createFileCancel.addEventListener('click', () => hideModal('create-file-modal'));
    if (fileTemplateSelect && fileContentTextarea) {
        fileTemplateSelect.addEventListener('change', function() {
            if (this.value) {
                fileContentTextarea.placeholder = 'Content will be generated from template';
                fileContentTextarea.disabled = true;
            } else {
                fileContentTextarea.placeholder = 'Enter initial content (optional)';
                fileContentTextarea.disabled = false;
            }
        });
    }
    if (createFileSubmit) {
        createFileSubmit.addEventListener('click', async function() {
            const fileName = document.getElementById('file-name').value.trim();
            const template = document.getElementById('file-template').value;
            const content = template ? '' : document.getElementById('file-content').value;
            
            if (!fileName) {
                alert('Please enter a file name');
                return;
            }
            
            // Determine the full file path
            let fullPath;
            if (contextMenuTargetFolder) {
                // Context menu creation - create in the specified folder
                fullPath = `${contextMenuTargetFolder}/${fileName}`;
                contextMenuTargetFolder = null; // Reset after use
            } else {
                // Regular button creation - create in root
                fullPath = fileName;
            }
            
            this.disabled = true;
            this.textContent = 'Creating...';
            
            try {
                const response = await createFile(fullPath, content, template);
                if (response.success) {
                    hideModal('create-file-modal');
                    await refreshFileTree();
                    setTimeout(() => {
                        openFileInEditor(fullPath);
                    }, 500);
                } else {
                    alert('Failed to create file: ' + response.message);
                }
            } catch (error) {
                alert('Error creating file: ' + error.message);
            } finally {
                this.disabled = false;
                this.textContent = 'Create File';
            }
        });

        const fileNameInput = document.getElementById('file-name');
            if (fileNameInput && createFileSubmit) {
                fileNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                createFileSubmit.click();
            }
        });
    }

    }
    const createFolderBtn = document.getElementById('create-folder-btn');
    const createFolderClose = document.getElementById('create-folder-close');
    const createFolderCancel = document.getElementById('create-folder-cancel');
    const createFolderSubmit = document.getElementById('create-folder-submit');
    if (createFolderBtn) createFolderBtn.addEventListener('click', () => showModal('create-folder-modal'));
    if (createFolderClose) createFolderClose.addEventListener('click', () => hideModal('create-folder-modal'));
    if (createFolderCancel) createFolderCancel.addEventListener('click', () => hideModal('create-folder-modal'));
    if (createFolderSubmit) {
        createFolderSubmit.addEventListener('click', async function() {
            const folderName = document.getElementById('folder-name').value.trim();
            
            if (!folderName) {
                alert('Please enter a folder name');
                return;
            }
            
            // Determine the full folder path
            let fullPath;
            if (contextMenuTargetFolder) {
                // Context menu creation - create in the specified folder
                fullPath = `${contextMenuTargetFolder}/${folderName}`;
                contextMenuTargetFolder = null; // Reset after use
            } else {
                // Regular button creation - create in root
                fullPath = folderName;
            }
            
            this.disabled = true;
            this.textContent = 'Creating...';
            
            try {
                const response = await createFolder(fullPath);
                if (response.success) {
                    hideModal('create-folder-modal');
                    await refreshFileTree();
                } else {
                    alert('Failed to create folder: ' + response.message);
                }
            } catch (error) {
                alert('Error creating folder: ' + error.message);
            } finally {
                this.disabled = false;
                this.textContent = 'Create Folder';
            }
        });
    }
    const renameItemClose = document.getElementById('rename-item-close');
    const renameItemCancel = document.getElementById('rename-item-cancel');
    const renameItemSubmit = document.getElementById('rename-item-submit');
    const renameItemInput = document.getElementById('rename-item-name');
    if (renameItemClose) renameItemClose.addEventListener('click', () => hideModal('rename-item-modal'));
    if (renameItemCancel) renameItemCancel.addEventListener('click', () => hideModal('rename-item-modal'));
    if (renameItemSubmit) {
        renameItemSubmit.addEventListener('click', async function() {
            if (!renameModalState) {
                hideModal('rename-item-modal');
                return;
            }

            const newName = renameItemInput ? renameItemInput.value.trim() : '';
            if (!newName) {
                alert('Please enter a name');
                if (renameItemInput) renameItemInput.focus();
                return;
            }

            if (newName === renameModalState.currentName) {
                hideModal('rename-item-modal');
                return;
            }

            const newPath = renameModalState.basePath ? `${renameModalState.basePath}/${newName}` : newName;

            this.disabled = true;
            const originalText = this.textContent;
            this.textContent = 'Renaming...';

            try {
                await performRename(renameModalState.oldPath, newPath, renameModalState.isDirectory);
                hideModal('rename-item-modal');
            } finally {
                this.disabled = false;
                this.textContent = originalText;
                renameModalState = null;
            }
        });
    }
    if (renameItemInput && renameItemSubmit) {
        renameItemInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                renameItemSubmit.click();
            }
        });
    }
    const duplicateItemClose = document.getElementById('duplicate-item-close');
    const duplicateItemCancel = document.getElementById('duplicate-item-cancel');
    const duplicateItemSubmit = document.getElementById('duplicate-item-submit');
    const duplicateItemInput = document.getElementById('duplicate-item-name');
    if (duplicateItemClose) duplicateItemClose.addEventListener('click', () => hideModal('duplicate-item-modal'));
    if (duplicateItemCancel) duplicateItemCancel.addEventListener('click', () => hideModal('duplicate-item-modal'));
    if (duplicateItemSubmit) {
        duplicateItemSubmit.addEventListener('click', async function() {
            if (!duplicateModalState) {
                hideModal('duplicate-item-modal');
                return;
            }

            const newName = duplicateItemInput ? duplicateItemInput.value.trim() : '';
            if (!newName) {
                alert('Please enter a name');
                if (duplicateItemInput) duplicateItemInput.focus();
                return;
            }

            const targetPath = duplicateModalState.basePath ? `${duplicateModalState.basePath}/${newName}` : newName;

            this.disabled = true;
            const originalText = this.textContent;
            this.textContent = 'Duplicating...';

            try {
                await performDuplicate(duplicateModalState.sourcePath, targetPath, duplicateModalState.isDirectory);
                hideModal('duplicate-item-modal');
            } finally {
                this.disabled = false;
                this.textContent = originalText;
                duplicateModalState = null;
            }
        });
    }
    if (duplicateItemInput && duplicateItemSubmit) {
        duplicateItemInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                duplicateItemSubmit.click();
            }
        });
    }
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            hideModal(event.target.id);
        }
    });
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const visibleModal = document.querySelector('.modal[style*="block"]');
            if (visibleModal) hideModal(visibleModal.id);
        }
    });
}
function setupHeaderButtons() {
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => refreshFileTree());
}
function setupUploadButtons() {
    const fileInput = document.getElementById('file-upload-input');
    const folderInput = document.getElementById('folder-upload-input');
    
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                if (isMobile()) {
                    showUploadMessage(`Uploading ${e.target.files.length} files...`, 'info');
                }
                handleFileUpload(e.target.files);
                e.target.value = '';
            }
        });
    }
    
    if (folderInput) {
        folderInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                if (isMobile()) {
                    showUploadMessage(`Uploading ${e.target.files.length} files from folder...`, 'info');
                }
                handleFileUpload(e.target.files);
                e.target.value = '';
            }
        });
    }
}

function setupDragAndDropMoving() {
    // Add global drag end cleanup to handle cases where drag operation is cancelled
    document.addEventListener('dragend', (event) => {
        cleanupDrag();
    });
    
    // Add global escape key handler to cancel drag operation
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && draggedData) {
            cleanupDrag();
        }
    });
}

function highlightFileInTree() {
    const activeFilePath = state.activeFilePath;
    const existingFileItem = document.querySelector('.file-item[data-path="' + activeFilePath + '"]');
    const isFileHidden = existingFileItem && existingFileItem.offsetParent === null;
    if (existingFileItem && !isFileHidden) {
        updateFileTreeActiveState(activeFilePath);
    } else {
        expandToCurrentFile(activeFilePath);
        refreshFileTree();
    }
}

function setupExplorerEventListeners() {
    qoomEvent.on('activeTabChangedInPane', highlightFileInTree);
    qoomEvent.on('addNewTab', highlightFileInTree);
    qoomEvent.on('fileRenamed', refreshFileTree);
    qoomEvent.on('fileDeleted', refreshFileTree);
}

async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="explorer.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/explorer/frontend/explorer.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load Explorer CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
    try {
        const response = await fetch('/view/applets/editer/components/explorer/frontend/explorer.html');
        const html = await response.text();
        const explorerContainer = document.querySelector('.explorer');
        explorerContainer.innerHTML = html;
    } catch (error) {
        console.error('Failed to load explorer template:', error);
    }
}

async function initialize(_state) {
    state = _state;
    await injectCSS();
    await injectHTML(); 
    
    setupTabToggle();
    refreshFileTree();
    setupModalEvents();
    setupHeaderButtons();
    setupDragAndDrop();
    setupUploadButtons();
    setupDragAndDropMoving();
    setupExplorerContextMenuEvents();
    setupExplorerEventListeners();
}

function setupExplorerContextMenuEvents() {
    qoomEvent.on('renameDirectory', (e) => {
        confirmRename(e.detail, true);
    });

    qoomEvent.on('renameFile', (e) => {
        confirmRename(e.detail, false);
    });

    qoomEvent.on('duplicateDirectory', (e) => {
        confirmDuplicate(e.detail, true);
    });

    qoomEvent.on('duplicateFile', (e) => {
        confirmDuplicate(e.detail, false);
    });

    qoomEvent.on('deleteDirectory', (e) => {
        confirmDelete(e.detail, true);
    });

    qoomEvent.on('deleteFile', (e) => {
        confirmDelete(e.detail, false);
    });

    qoomEvent.on('downloadDirectory', (e) => {
        downloadFolder(e.detail, true);
    });

    qoomEvent.on('downloadFile', (e) => {
        downloadFile(e.detail, false);
    });

    qoomEvent.on('openInTerminal', (e) => {
        const { path, isDirectory, root } = e.detail;
        openInTerminal(path, isDirectory, root);
    });

    qoomEvent.on('uploadFiles', (e) => {
        uploadFilesToFolder(e.detail);
    });

    qoomEvent.on('deleteMultiple', (e) => {
        const { selection } = e.detail;
        confirmDeleteMultiple(selection);
    });

    qoomEvent.on('downloadMultiple', (e) => {
        const { selection } = e.detail;
        downloadMultiple(selection);
    });

    qoomEvent.on('uploadFolder', (e) => {
        uploadFolderToFolder(e.detail);
    });

    qoomEvent.on('createFile', (e) => {
        createFileInFolder(e.detail);
    });

    qoomEvent.on('createFolder', (e) => {
        createFolderInFolder(e.detail);
    });
}

export {
    initialize
}
