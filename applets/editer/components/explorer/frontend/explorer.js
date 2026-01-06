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

// Get file icon for display
function getFileIcon(fileName, isDirectory) {
    if (isDirectory) return '📁';
    const ext = fileName.split('.').pop().toLowerCase();
    const iconMap = {
        'js': '📄', 'json': '🔧', 'html': '🌐', 'css': '🎨', 'md': '📝',
        'py': '🐍', 'txt': '📄', 'xml': '📄', 'sql': '🗃️'
    };
    return iconMap[ext] || '📄';
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
    const explorerActions = document.querySelectorAll('.explorer-tab-only');
    const searchBtn = document.getElementById('explorer-search-btn');
    const explorerTitle = document.querySelector('.explorer-title');

    if (tabName === 'explorer') {
        explorerView.classList.add('active');
        searchView.classList.remove('active');
        explorerActions.forEach(btn => {
            if (btn.dataset.tab === 'explorer') {
                btn.style.display = 'block';
            }
        });
        if (searchBtn) searchBtn.classList.remove('active');
        if (explorerTitle) {
            explorerTitle.textContent = 'Explorer';
            explorerTitle.style.fontWeight = '600';
        }
    } else if (tabName === 'search') {
        explorerView.classList.remove('active');
        searchView.classList.add('active');
        explorerActions.forEach(btn => {
            if (btn.dataset.tab === 'explorer') {
                btn.style.display = 'none';
            }
        });
        if (searchBtn) searchBtn.classList.add('active');
        if (explorerTitle) {
            explorerTitle.textContent = 'Search';
            explorerTitle.style.fontWeight = '600';
        }
        // Initialize search tab if not already initialized
        const searchContainer = searchView.querySelector('.search-tab-container');
        if (searchContainer && !searchContainer.hasAttribute('data-initialized')) {
            searchTab.initialize(searchContainer);
        }
    }

    currentTab = tabName;
}

function setupTabToggle() {
    // Setup search button in explorer-actions
    const searchBtn = document.getElementById('explorer-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            switchTab('search');
        });
    }
    
    // Setup toggle back to explorer (click on title or when needed)
    const explorerTitle = document.querySelector('.explorer-title');
    if (explorerTitle) {
        explorerTitle.addEventListener('click', () => {
            if (currentTab === 'search') {
                switchTab('explorer');
            }
        });
        explorerTitle.style.cursor = 'pointer';
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
        
        const response = await fetch('/edit/creater/_api/file', {
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
        const response = await fetch('/edit/creater/_api/file/' + filePath, {
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
        const response = await fetch('/edit/creater/_api/folder', {
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
        const response = await fetch('/edit/creater/_api/rename', {
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
        const response = await fetch('/edit/creater/_api/duplicate/file', {
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
        const response = await fetch('/edit/creater/_api/duplicate/folder', {
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
        const response = await fetch('/edit/creater/_api/folder', {
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

// Drag start
function onDragStart(e) {
    const fileItem = e.target.closest('.file-item');
    if (!fileItem) return;
    
    draggedElement = fileItem;
    draggedData = {
        path: fileItem.getAttribute('data-path'),
        isDirectory: fileItem.getAttribute('data-is-directory') === 'true'
    };
    
    // Apply style to dragging element
    fileItem.classList.add('dragging');
    
    // Set drag data
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedData.path);
}

// Drag over (check if drop is allowed)
function onDragOver(e) {
    e.preventDefault();
    
    // Only for desktop (if dataTransfer exists)
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'none';
    }
    
    if (!draggedData) return;
    
    const fileItem = e.target.closest('.file-item');
    const container = e.target.closest('.file-tree-container');
    
    if (fileItem) {
        const isDirectory = fileItem.getAttribute('data-is-directory') === 'true';
        const targetPath = fileItem.getAttribute('data-path');
        
        // Allow drop only if folder, not self, and not a descendant
        if (isDirectory && 
            targetPath !== draggedData.path && 
            !isDescendantPath(targetPath, draggedData.path)) {
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
        }
    } else if (container) {
        // Drop on container (move to root)
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
    }
}

// Drag enter (visual feedback)
function onDragEnter(e) {
    e.preventDefault();
    
    if (!draggedData) return;
    
    const fileItem = e.target.closest('.file-item');
    const container = e.target.closest('.file-tree-container');
    
    if (fileItem) {
        const isDirectory = fileItem.getAttribute('data-is-directory') === 'true';
        const targetPath = fileItem.getAttribute('data-path');
        
        if (isDirectory && 
            targetPath !== draggedData.path && 
            !isDescendantPath(targetPath, draggedData.path)) {
            fileItem.classList.add('drag-over');
        }
    } else if (container) {
        container.classList.add('root-drop-active');
    }
}

// Drag leave (remove visual feedback)
function onDragLeave(e) {
    const fileItem = e.target.closest('.file-item');
    const container = e.target.closest('.file-tree-container');
    
    if (fileItem) {
        fileItem.classList.remove('drag-over');
    } else if (container) {
        container.classList.remove('root-drop-active');
    }
}

// Drop handling
function onDrop(e) {
    e.preventDefault();
    
    if (!draggedData) {
        cleanupDrag();
        return;
    }
    
    const fileItem = e.target.closest('.file-item');
    const container = e.target.closest('.file-tree-container');
    
    let targetPath = '.';
    
    if (fileItem) {
        const isDirectory = fileItem.getAttribute('data-is-directory') === 'true';
        const target = fileItem.getAttribute('data-path');
        
        if (isDirectory && 
            target !== draggedData.path && 
            !isDescendantPath(target, draggedData.path)) {
            targetPath = target;
        } else {
            cleanupDrag();
            return;
        }
    }
    
    try {
        performMove(draggedData.path, targetPath, draggedData.isDirectory)
            .catch((error) => {
                console.error('File move error:', error);
                showMessage(`File move error: ${error.message}`, 'error');
            });
    } catch (error) {
        console.error('Drop handling error:', error);
        showMessage(`Drop handling error: ${error.message}`, 'error');
    }
    
    cleanupDrag();
}

// Drag end (cleanup)
function onDragEnd(e) {
    cleanupDrag();
}

// Cleanup drag state
function cleanupDrag() {
    try {
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
        }
        
        // Remove all visual feedback
        const dragOverElements = document.querySelectorAll('.drag-over');
        dragOverElements.forEach(el => {
            el.classList.remove('drag-over');
        });
        
        const rootDropElements = document.querySelectorAll('.root-drop-active');
        rootDropElements.forEach(el => {
            el.classList.remove('root-drop-active');
        });
        
        draggedElement = null;
        draggedData = null;
    } catch (error) {
        console.error('Drag cleanup error:', error);
        // Initialize state even if error occurs
        draggedElement = null;
        draggedData = null;
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
        const response = await fetch('/edit/creater/_api/rename', {
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
            if (state.activeFilePath && (state.activeFilePath === sourcePath || state.activeFilePath.startsWith(sourcePath + '/'))) {
                const newFileName = state.activeFilePath.replace(sourcePath, newPath);
                state.activeFilePath = newFileName;
            }
            
            // Refresh the file tree
            await refreshFileTree();
            
            showMoveMessage(
                `Successfully moved ${isDirectory ? 'folder' : 'file'} "${fileName}" to "${targetDirectoryPath}".`,
                'success'
            );
        } else {
            throw new Error(result.error || 'Received failure response from API');
        }
        
    } catch (error) {
        console.error('performMove error:', error);
        hideMoveProgress();
        showMoveMessage(`File move failed: ${error.message}`, 'error');
    }
}

function showMoveProgress(sourcePath, targetPath) {
    const progressDiv = document.createElement('div');
    progressDiv.id = 'move-progress';
    progressDiv.className = 'move-progress';
    progressDiv.innerHTML = `
        <div class="move-progress-content">
            <div class="move-progress-text">Moving "${sourcePath}" to "${targetPath}"...</div>
            <div class="move-progress-spinner"></div>
        </div>
    `;
    document.querySelector('.explorer-content').appendChild(progressDiv);
}

function hideMoveProgress() {
    const progressDiv = document.getElementById('move-progress');
    if (progressDiv) progressDiv.remove();
}

function showMoveMessage(message, type = 'success') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `move-message move-message-${type}`;
    messageDiv.textContent = message;
    document.querySelector('.explorer-content').appendChild(messageDiv);
    setTimeout(() => { messageDiv.remove(); }, 3000);
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
    
    container.removeEventListener('dragover', onDragOver);
    container.removeEventListener('dragenter', onDragEnter);
    container.removeEventListener('dragleave', onDragLeave);
    container.removeEventListener('drop', onDrop);
    
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
        fileTree.addEventListener('dragstart', onDragStart);
        fileTree.addEventListener('dragover', onDragOver);
        fileTree.addEventListener('dragenter', onDragEnter);
        fileTree.addEventListener('dragleave', onDragLeave);
        fileTree.addEventListener('drop', onDrop);
        fileTree.addEventListener('dragend', onDragEnd);
        
        // Add event listeners for container
        container.addEventListener('dragover', onDragOver);
        container.addEventListener('dragenter', onDragEnter);
        container.addEventListener('dragleave', onDragLeave);
        container.addEventListener('drop', onDrop);
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
    
    if (isDirectory) {
        toggleDirectory(fileItem, path);
    } else {
        openFileInEditor(path);
    }
}

function handleTreeContextMenu(e) {
    const fileItem = e.target.closest('.file-item');
    if (!fileItem) return;
    
    e.preventDefault();
    const path = fileItem.getAttribute('data-path');
    const isDirectory = fileItem.getAttribute('data-is-directory') === 'true';
    
    if (isDirectory) {
        state.context.showDirectoryMenu(e, path)
    } else {
        state.context.showFileMenu(e, path)
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

function confirmRename(path, isDirectory) {
    const itemType = isDirectory ? 'folder' : 'file';
    const currentName = path.split('/').pop();
    const basePath = path.substring(0, path.lastIndexOf('/')) || '';
    const newName = prompt(`Enter new name for this ${itemType}:`, currentName);
    if (newName && newName.trim() && newName !== currentName) {
        const newPath = basePath ? `${basePath}/${newName.trim()}` : newName.trim();
        performRename(path, newPath, isDirectory);
    }
}
async function performRename(oldPath, newPath, isDirectory) {
    try {
        const response = await renameItem(oldPath, newPath);
        if (response.success) {
            // do nothing. Watcher will trigger the next sequence of changes
        } else {
            alert(`Failed to rename ${isDirectory ? 'folder' : 'file'}: ${response.error}`);
        }
    } catch (error) {
        alert(`Error renaming ${isDirectory ? 'folder' : 'file'}: ${error.message}`);
    }
}

function confirmDuplicate(path, isDirectory) {
    const itemType = isDirectory ? 'folder' : 'file';
    const originalName = path.split('/').pop();
    const basePath = path.substring(0, path.lastIndexOf('/')) || '';
    const extension = isDirectory ? '' : (originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '');
    const nameWithoutExt = isDirectory ? originalName : (originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName);
    const defaultDuplicateName = `${nameWithoutExt}_copy${extension}`;
    const newName = prompt(`Enter name for the duplicate ${itemType}:`, defaultDuplicateName);
    if (newName && newName.trim()) {
        const targetPath = basePath ? `${basePath}/${newName.trim()}` : newName.trim();
        performDuplicate(path, targetPath, isDirectory);
    }
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
    const explorerContent = document.querySelector('.explorer-content');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        explorerContent.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        explorerContent.addEventListener(eventName, highlight, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        explorerContent.addEventListener(eventName, unhighlight, false);
    });
    explorerContent.addEventListener('drop', handleDrop, false);
    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
    function highlight() { explorerContent.classList.add('drag-over'); }
    function unhighlight() { explorerContent.classList.remove('drag-over'); }
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFileUpload(files);
    }
}
function handleFileUpload(files) {
    if (!files || files.length === 0) {
        return;
    }
    
    const filesToUpload = [];
    let processedCount = 0;
    
    Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const base64Content = e.target.result.split(',')[1];
                const fileName = file.webkitRelativePath || file.name;
                
                filesToUpload.push({ fileName: fileName, fileContent: base64Content });
                processedCount++;
                
                if (processedCount === files.length) {
                    uploadFiles(filesToUpload);
                }
            } catch (error) {
                console.error('Error processing file:', error);
                showUploadMessage(`File processing error: ${error.message}`, 'error');
            }
        };
        
        reader.onerror = function(error) {
            console.error('FileReader error:', error);
            showUploadMessage(`File read error: ${error.message}`, 'error');
        };
        
        reader.readAsDataURL(file);
    });
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
function showUploadProgress(fileCount) {
    const progressDiv = document.createElement('div');
    progressDiv.id = 'upload-progress';
    progressDiv.className = 'upload-progress';
    progressDiv.innerHTML = `
        <div class="upload-progress-content">
            <div class="upload-progress-text">Uploading ${fileCount} files...</div>
            <div class="upload-progress-bar">
                <div class="upload-progress-fill"></div>
            </div>
        </div>
    `;
    document.querySelector('.explorer-content').appendChild(progressDiv);
}
function hideUploadProgress() {
    const progressDiv = document.getElementById('upload-progress');
    if (progressDiv) progressDiv.remove();
}
function showUploadMessage(message, type = 'success') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `upload-message upload-message-${type}`;
    messageDiv.textContent = message;
    document.querySelector('.explorer-content').appendChild(messageDiv);
    setTimeout(() => { messageDiv.remove(); }, 3000);
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
                    fetch('/edit/creater/_api/folder', {
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

// --- Modal and header events ---

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
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
    const newFileBtn = document.querySelector('.new-file-btn');
    const newFolderBtn = document.querySelector('.new-folder-btn');
    const refreshBtn = document.querySelector('.refresh-btn');
    if (newFileBtn) newFileBtn.addEventListener('click', () => showModal('create-file-modal'));
    if (newFolderBtn) newFolderBtn.addEventListener('click', () => showModal('create-folder-modal'));
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
    });contextMenu:

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
