/**
 * Context Menu System JavaScript
 * 
 * Centralized context menu functionality for explorer and editor tabs
 */

'use strict';
import qoomEvent from "../../../utils/qoomEvent.js"

let state = null;

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `upload-message upload-message-${type}`;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    setTimeout(() => { messageDiv.remove(); }, 3000);
}

async function getWorkspaceRoot() {
    try {
        const response = await fetch('/editer/explorer/_api/workspace-info');
        if (response.ok) {
            const json = await response.json();
            return json.data.workspaceRoot;
        }
    } catch (error) {
        console.warn('Could not get workspace info from server:', error);
    }
    return;
}

function fallbackCopyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    
    try {
        textarea.select();
        textarea.setSelectionRange(0, 99999);
        document.execCommand('copy');
    } catch (error) {
        console.error('Fallback copy failed:', error);
        throw error;
    } finally {
        document.body.removeChild(textarea);
    }
}

async function copyRelativePath(path) {
    try {
        await navigator.clipboard.writeText(path);
        showMessage(`Relative path copied: ${path}`, 'success');
    } catch (error) {
        console.error('Failed to copy relative path:', error);
        fallbackCopyToClipboard(path);
        showMessage(`Relative path copied: ${path}`, 'success');
    }
}

async function copyAbsolutePath(relativePath) {
    try {
        const workspaceRoot = await getWorkspaceRoot();
        const absolutePath = workspaceRoot + '/' + relativePath;
        
        await navigator.clipboard.writeText(absolutePath);
        showMessage(`Absolute path copied: ${absolutePath}`, 'success');
    } catch (error) {
        console.error('Failed to copy absolute path:', error);
        try {
            const workspaceRoot = await getWorkspaceRoot();
            const absolutePath = workspaceRoot + '/' + relativePath;
            fallbackCopyToClipboard(absolutePath);
            showMessage(`Absolute path copied: ${absolutePath}`, 'success');
        } catch (fallbackError) {
            console.error('Fallback copy also failed:', fallbackError);
            showMessage('Failed to copy absolute path', 'error');
        }
    }
}

function viewFile(path) {
    const url = `/render/${path}`;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function removeContextMenu() {
    const existingMenus = document.querySelectorAll('.context-menu');
    existingMenus.forEach(menu => menu.remove());
}

// Mobile device detection
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768) ||
           ('ontouchstart' in window);
}

function showContextMenu(event, menuItems, menuId = 'context-menu') {
    event.preventDefault();
    event.stopPropagation();
    
    removeContextMenu();
    
    const menu = document.createElement('div');
    menu.id = menuId;
    menu.className = 'context-menu';
    
    // Add close button for mobile (only for explorer-context-menu)
    if (isMobileDevice() && menuId === 'explorer-context-menu') {
        const closeButton = document.createElement('button');
        closeButton.className = 'context-menu-close';
        closeButton.innerHTML = '×';
        closeButton.setAttribute('aria-label', 'Close menu');
        closeButton.addEventListener('click', () => {
            removeContextMenu();
        });
        menu.appendChild(closeButton);
    }
    
    menuItems.forEach(item => {
        if (item.type === 'separator') {
            const separator = document.createElement('div');
            separator.className = 'context-menu-separator';
            menu.appendChild(separator);
        } else {
            const menuItem = document.createElement('div');
            const classes = ['context-menu-item'];
            if (item.className) classes.push(item.className);
            menuItem.className = classes.join(' ');
            
            menuItem.innerHTML = `
                <span class="context-menu-icon">${item.icon}</span>
                <span class="context-menu-text">${item.text}</span>
            `;
            
            // Use event listener instead of onclick
            menuItem.addEventListener('click', () => {
                item.handler();
            });
            
            menu.appendChild(menuItem);
        }
    });
    menu.style.position = 'fixed';
    menu.style.visibility = 'hidden'; // Hide first for position calculation
    document.body.appendChild(menu);
    
    // Measure actual menu size
    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width;
    const menuHeight = menuRect.height;
    
    // Viewport size
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Set initial position
    let left = event.clientX;
    let top = event.clientY;
    
    // Check right boundary - move left if menu goes outside screen
    if (left + menuWidth > viewportWidth) {
        left = event.clientX - menuWidth;
        // If it goes left too, position to the left of button
        if (left < 0) {
            left = Math.max(4, event.clientX - menuWidth);
        }
    }
    
    // Check bottom boundary - move up if menu goes outside screen
    if (top + menuHeight > viewportHeight) {
        top = event.clientY - menuHeight;
        // If it goes up too, position at top of screen
        if (top < 0) {
            top = 4;
        }
    }
    
    // Ensure minimum margin
    left = Math.max(4, Math.min(left, viewportWidth - menuWidth - 4));
    top = Math.max(4, Math.min(top, viewportHeight - menuHeight - 4));
    
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = 'visible'; // Show after position is set
    
    // Remove menu when clicking outside
    const removeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', removeMenu);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', removeMenu);
    }, 0);
}

async function closeAllOtherTabs(paneId, keepTabId) {
    removeContextMenu();
    state.layout.panes[paneId].closeAllOtherTabs(keepTabId);
}

async function closeTab(paneId, tabId) {
    removeContextMenu();
    state.layout.panes[paneId].closeTab(tabId);
}

function showTabContextMenu(event, paneId, tabId, filePath) {
    const menuItems = [
        {
            icon: '📄',
            text: 'Close All Other Tabs',
            handler: () => {
                removeContextMenu();
                closeAllOtherTabs(paneId, tabId);
            }
        },
        { type: 'separator' },
        {
            icon: '📄',
            text: 'Copy Relative Path',
            handler: () => {
                removeContextMenu();
                copyRelativePath(filePath)
            } 
        },
        {
            icon: '🔗',
            text: 'Copy Absolute Path',
            handler: () => {
                removeContextMenu();
                copyAbsolutePath(filePath);
            }
        },
        { type: 'separator' },
        {
            icon: '✖️',
            text: 'Close Tab',
            handler: () => {
                removeContextMenu();
                closeTab(paneId, tabId);
            }
        },
        {
            icon: '👁️',
            text: 'View File',
            handler: () => {
                removeContextMenu();
                viewFile(filePath);
            }
        }
    ];
    
    showContextMenu(event, menuItems, 'tab-context-menu');
}

function showExplorerContextMenu(event, path, isDirectory, selection) {
    const selectionCount = selection ? selection.length : 0;
    const itemType = isDirectory ? 'Folder' : 'File';
    
    let menuItems = [];

    if (selectionCount > 1) {
        menuItems = [
            {
                icon: '🗑️',
                text: `Delete ${selectionCount} Items`,
                className: 'delete-item',
                handler: () => {
                    removeContextMenu();
                    qoomEvent.emit('deleteMultiple', { selection });
                }
            }
        ];
    } else {
        menuItems = [
            {
                icon: '✏️',
                text: `Rename ${itemType}`,
                handler: () => {
                    removeContextMenu();
                    if (isDirectory) {
                        state.explorer.renameDirectory(path);
                    } else {
                        state.explorer.renameFile(path);
                    }
                }
            },
            {
                icon: '📋',
                text: `Duplicate ${itemType}`,
                handler: () => {
                    removeContextMenu();
                    if (isDirectory) {
                        state.explorer.duplicateDirectory(path);
                    } else {
                        state.explorer.duplicateFile(path);
                    }
                }
            },
            { type: 'separator' },
            {
                icon: '💻',
                text: 'Open in Terminal',
                handler: async () => {
                    removeContextMenu();
                    const root = await getWorkspaceRoot();
                    state.explorer.openInTerminal(path, isDirectory, root);
                }
            },
            { type: 'separator' },
            {
                icon: '📄',
                text: 'Copy Relative Path',
                handler: () => {
                    removeContextMenu();
                    copyRelativePath(path);
                }
            },
            {
                icon: '🔗',
                text: 'Copy Absolute Path',
                handler: () => {
                    removeContextMenu();
                    copyAbsolutePath(path);
                }
            }
        ];
        
        if (isDirectory) {
            menuItems.push(
                { type: 'separator' },
                {
                    icon: '📤',
                    text: 'Upload Files',
                    handler: () => {
                        removeContextMenu();
                        state.explorer.uploadFiles(path);
                    }
                },
                {
                    icon: '📂',
                    text: 'Upload Folder',
                    handler: () => {
                        removeContextMenu();
                        state.explorer.uploadFolder(path);
                    }
                },
                { type: 'separator' },
                {
                    icon: '📄',
                    text: 'New File',
                    handler: () => {
                        removeContextMenu();
                        state.explorer.createFile(path);
                    }
                },
                {
                    icon: '📁',
                    text: 'New Folder',
                    handler: () => {
                        removeContextMenu();
                        state.explorer.createFolder(path);
                    }
                }
            );
        } else {
            menuItems.push(
                { type: 'separator' },
                {
                    icon: '👁️',
                    text: 'View File',
                    handler: () => {
                        removeContextMenu();
                        viewFile(path);
                    }
                }
            );
        }
        
        menuItems.push(
            { type: 'separator' },
            {
                icon: '💾',
                text: `Download ${itemType}`,
                handler: () => {
                    removeContextMenu();
                    if (isDirectory) {
                        state.explorer.downloadDirectory(path);
                    } else {
                        state.explorer.downloadFile(path);
                    }
                }
            },
            { type: 'separator' },
            {
                icon: '🗑️',
                text: `Delete ${itemType}`,
                className: 'delete-item',
                handler: () => {
                    removeContextMenu();
                    if (isDirectory) {
                        state.explorer.deleteDirectory(path);
                    } else {
                        state.explorer.deleteFile(path);
                    }
                }
            }
        );
    }
    
    showContextMenu(event, menuItems, 'explorer-context-menu');
}

async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="context.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/contexter/frontend/context.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load Context CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
    try {
        const response = await fetch("/view/applets/editer/components/contexter/frontend/context.html");
        const html = await response.text();
        const contexterContainer = document.querySelector(".context");
        if (contexterContainer) {
            contexterContainer.innerHTML = html;
        }
    } catch (error) {
        console.error("Failed to load contexter template:", error);
    }
}

async function initialize(_state) {
    state = _state;
    await injectCSS();
    await injectHTML();
    
    // Listen for context menu events
    qoomEvent.on('showTabContextMenu', (e) => {
        const { event, paneId, tabId, filePath } = e.detail;
        showTabContextMenu(event, paneId, tabId, filePath);
    });
    
    qoomEvent.on('showExplorerContextMenu', (e) => {
        const { event, path, isDirectory, selection } = e.detail;
        showExplorerContextMenu(event, path, isDirectory, selection);
    });
}

export {
    initialize
}