import { inject as injectNavigater } from '/view/applets/navigater/frontend/navigater.js';

// Terminal state
let terminal = null;
let websocket = null;
let fitAddon = null;
let webLinksAddon = null;
let searchAddon = null;
let resizeTimeout;
let connectionStatus = 'connecting';
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;
let isFirstConnection = true;

function isInIframe() {
    try {
        return window.self !== window.top;
    } catch (e) {
        // If we can't access window.top due to cross-origin restrictions,
        // we're likely in an iframe
        return true;
    }
}

// Get working directory from URL parameter
function getWorkingDirectory() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('cwd') || '';
}

// Global session - no recovery needed, always connect to the same session

function executeCommand(command) {
    if (!terminal || !websocket || websocket.readyState !== WebSocket.OPEN) {
        console.error('Terminal or WebSocket not ready');
        return;
    }
    
    // Send the command to the terminal
    websocket.send(JSON.stringify({
        type: 'input',
        data: command
    }));
    
    console.log('Command executed:', command.trim());
}

// Initialize terminal
function initializeTerminal() {
    try {
        // Create terminal instance
        terminal = new Terminal({
            theme: {
                background: '#000000',
                foreground: '#ffffff',
                cursor: '#ffffff',
                cursorAccent: '#000000',
                selection: 'rgba(255, 255, 255, 0.3)',
                black: '#000000',
                red: '#cd0000',
                green: '#00cd00',
                yellow: '#cdcd00',
                blue: '#0000ee',
                magenta: '#cd00cd',
                cyan: '#00cdcd',
                white: '#e5e5e5',
                brightBlack: '#7f7f7f',
                brightRed: '#ff0000',
                brightGreen: '#00ff00',
                brightYellow: '#ffff00',
                brightBlue: '#5c5cff',
                brightMagenta: '#ff00ff',
                brightCyan: '#00ffff',
                brightWhite: '#ffffff'
            },
            fontFamily: 'Courier New, monospace',
            fontSize: 14,
            lineHeight: 1.2,
            cursorBlink: true,
            cursorStyle: 'block',
            scrollback: 1000,
            tabStopWidth: 4
        });
        
        // Load addons
        fitAddon = new FitAddon.FitAddon();
        webLinksAddon = new WebLinksAddon.WebLinksAddon();
        searchAddon = new SearchAddon.SearchAddon();
        
        // Load addons into terminal
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);
        terminal.loadAddon(searchAddon);
        
        // Open terminal in container
        terminal.open(document.getElementById('terminal'));
        
        // Fit terminal to container
        fitAddon.fit();
        
        // Handle input
        terminal.onData(data => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({
                    type: 'input',
                    data: data
                }));
            }
        });
        
        // Handle resize
        terminal.onResize(({ cols, rows }) => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({
                    type: 'resize',
                    cols: cols,
                    rows: rows
                }));
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (fitAddon) {
                    fitAddon.fit();
                    terminal.clear();
                }
            }, 150);
        });

        window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin) {
                return;
            }
            
            if (event.data.type === 'executeCommand' && event.data.command) {
                executeCommand(event.data.command);
            }
        });
        
        // Hide loading message
        document.getElementById('loading').style.display = 'none';
        
        // Setup reset button event listener
        const resetBtn = document.getElementById('resetTerminalBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                resetTerminalSession();
            });
        }
        
        // Connect to the global session
        connectWebSocket();

        if (isInIframe()) {
            document.querySelector('.header').style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error initializing terminal:', error);
        showError('Failed to initialize terminal: ' + error.message);
    }
}

// Connect to WebSocket
function connectWebSocket() {
    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const workingDir = getWorkingDirectory();
        
        let wsUrl = protocol + '//' + window.location.host + '/terminal/_ws';
        
        // Add working directory as query parameter if specified
        if (workingDir) {
            wsUrl += '?cwd=' + encodeURIComponent(workingDir);
        }
        
        websocket = new WebSocket(wsUrl);
        
        websocket.onopen = () => {
            console.log('WebSocket connected');
            reconnectAttempts = 0; // Reset on successful connection
            updateStatus('connected', 'Connected');
            
            // Send initial resize
            if (terminal) {
                websocket.send(JSON.stringify({
                    type: 'resize',
                    cols: terminal.cols,
                    rows: terminal.rows
                }));
            }
        };
        
        websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                switch (data.type) {
                    case 'output':
                        if (terminal) {
                            terminal.write(data.data);
                        }
                        break;
                    case 'session':
                        console.log('Global session info:', data);
                        
                        let statusMessage = 'Connected - ' + data.shell;
                        if (data.persistent) {
                            statusMessage += ' (Global Session)';
                        }
                        
                        // Restore buffer content if available
                        if (data.bufferContent && terminal) {
                            console.log('Restoring terminal buffer content');
                            // Clear terminal first
                            terminal.clear();
                            // Write the restored buffer content
                            terminal.write(data.bufferContent);
                            
                            // Only show connection message on first connection or when explicitly recovering
                            if (data.existingSession && isFirstConnection) {
                                terminal.write('\r\n\x1b[32m[Connected to global terminal session - history restored]\x1b[0m\r\n');
                            }
                        } else if (terminal && isFirstConnection) {
                            terminal.write('\r\n\x1b[32m[Connected to global terminal session]\x1b[0m\r\n');
                        }
                        
                        // Mark that we've connected at least once
                        isFirstConnection = false;
                        
                        updateStatus('connected', statusMessage);
                        break;
                    case 'exit':
                        console.log('Terminal process exited:', data.code);
                        if (terminal) {
                            terminal.write('\\r\\n\\r\\n[Process exited with code: ' + data.code + ']\\r\\n');
                            terminal.write('[Press any key to restart]\\r\\n');
                        }
                        break;
                    case 'server_restart':
                        console.log('Server restart notification:', data.message);
                        if (terminal) {
                            terminal.write(`\r\n\x1b[33m[${data.message}]\x1b[0m\r\n`);
                        }
                        // Global session will be preserved on server restart
                        break;
                    case 'reset':
                        console.log('Terminal reset notification:', data.message);
                        if (terminal) {
                            terminal.write(`\r\n\x1b[31m[${data.message}]\x1b[0m\r\n`);
                        }
                        updateStatus('connecting', 'Resetting...');
                        break;
                    default:
                        console.log('Unknown message type:', data.type);
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };
        
        websocket.onclose = () => {
            console.log('WebSocket connection closed');
            updateStatus('disconnected', 'Disconnected');
            
            // Enhanced reconnection with exponential backoff
            if (reconnectAttempts < maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                setTimeout(() => {
                    if (connectionStatus !== 'connected') {
                        reconnectAttempts++;
                        updateStatus('connecting', `Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
                        connectWebSocket();
                    }
                }, delay);
            } else {
                updateStatus('error', 'Connection failed - please refresh');
                if (terminal) {
                    terminal.write('\r\n\x1b[31m[Connection failed after multiple attempts. Please refresh the page.]\x1b[0m\r\n');
                }
            }
        };
        
        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateStatus('error', 'Connection Error');
        };
        
    } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        showError('Failed to connect to terminal: ' + error.message);
    }
}

// Update connection status
function updateStatus(status, message) {
    connectionStatus = status;
    
    // Update status text
    const statusTextElement = document.getElementById('status-text');
    if (statusTextElement) {
        statusTextElement.textContent = message;
    }
    
    // Update status dot color
    const statusDotElement = document.getElementById('status-dot');
    if (statusDotElement) {
        // Remove existing status classes
        statusDotElement.classList.remove('connected', 'connecting', 'disconnected', 'error');
        // Add new status class
        statusDotElement.classList.add(status);
    }
}

// Show error message
function showError(message) {
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

async function resetTerminalSession() {
    try {
        updateStatus('connecting', 'Resetting terminal session...');
        
        const response = await fetch('/_api/sessions/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Terminal session reset successfully');
            updateStatus('connecting', 'Reconnecting to new session...');
            
            // Close existing WebSocket connection
            if (websocket) {
                websocket.close();
            }
            
            // Clear terminal
            if (terminal) {
                terminal.clear();
            }
            
            // Reset the first connection flag so user sees the connection message after manual reset
            isFirstConnection = true;
            
            // Reconnect to the new session
            setTimeout(() => {
                connectWebSocket();
            }, 1000);
            
        } else {
            console.error('Failed to reset terminal session:', result.error);
            updateStatus('disconnected', 'Reset failed');
        }
    } catch (error) {
        console.error('Error resetting terminal session:', error);
        updateStatus('disconnected', 'Reset failed');
    }
}

initializeTerminal();
injectNavigater('terminaler');