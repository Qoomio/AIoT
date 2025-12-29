/**
 * Terminaler API
 * 
 * Provides terminal functionality through WebSocket communication
 * and manages terminal processes using node-pty
 */

import WebSocket from 'ws';
import pty from 'node-pty';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateTerminalHTML } from './app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single global terminal session
const GLOBAL_SESSION_ID = 'global_terminal_session';
let globalTerminalSession = null;

// Session persistence directory
const sessionsDir = path.join(__dirname, 'sessions');

// Ensure sessions directory exists
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

/**
 * Check if tmux is available on the system
 * @returns {boolean} - Whether tmux is available
 */
function isTmuxAvailable() {
    try {
        execSync('which tmux', { stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Save session state to filesystem
 * @param {string} sessionId - Session ID
 * @param {Object} sessionData - Session data to save
 */
function saveSessionState(sessionId, sessionData) {
    try {
        const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
        const stateData = {
            sessionId,
            cwd: sessionData.cwd,
            created: sessionData.created,
            lastActivity: Date.now(),
            tmuxSession: sessionData.tmuxSession,
            shell: sessionData.shell,
            platform: process.platform,
            terminalBuffer: sessionData.terminalBuffer || null
        };
        fs.writeFileSync(sessionFile, JSON.stringify(stateData, null, 2));
        console.log(`Session state saved: ${sessionId}`);
    } catch (error) {
        console.error(`Failed to save session state for ${sessionId}:`, error);
    }
}

/**
 * Load session state from filesystem
 * @param {string} sessionId - Session ID
 * @returns {Object|null} - Session data or null if not found
 */
function loadSessionState(sessionId) {
    try {
        const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
        if (fs.existsSync(sessionFile)) {
            const data = fs.readFileSync(sessionFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Failed to load session state for ${sessionId}:`, error);
    }
    return null;
}

/**
 * Remove session state file
 * @param {string} sessionId - Session ID
 */
function removeSessionState(sessionId) {
    try {
        const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
        if (fs.existsSync(sessionFile)) {
            fs.unlinkSync(sessionFile);
            console.log(`Session state removed: ${sessionId}`);
        }
    } catch (error) {
        console.error(`Failed to remove session state for ${sessionId}:`, error);
    }
}

/**
 * Get all saved session IDs
 * @returns {string[]} - Array of session IDs
 */
function getSavedSessions() {
    try {
        const files = fs.readdirSync(sessionsDir);
        return files
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''));
    } catch (error) {
        console.error('Failed to get saved sessions:', error);
        return [];
    }
}

/**
 * Check if tmux session exists
 * @param {string} sessionName - Tmux session name
 * @returns {boolean} - Whether session exists
 */
function tmuxSessionExists(sessionName) {
    if (!isTmuxAvailable()) return false;
    
    try {
        execSync(`tmux has-session -t "${sessionName}"`, { stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Capture tmux session buffer content
 * @param {string} sessionName - Tmux session name
 * @returns {string|null} - Buffer content or null if failed
 */
function captureTmuxBuffer(sessionName) {
    if (!isTmuxAvailable() || !tmuxSessionExists(sessionName)) return null;
    
    try {
        // Capture the entire scrollback buffer from tmux
        const buffer = execSync(`tmux capture-pane -t "${sessionName}" -p -S -1000`, { 
            encoding: 'utf8',
            timeout: 5000 
        });
        return buffer;
    } catch (error) {
        console.error(`Failed to capture tmux buffer for ${sessionName}:`, error);
        return null;
    }
}

/**
 * Get tmux session history
 * @param {string} sessionName - Tmux session name
 * @returns {string|null} - Session history or null if failed
 */
function getTmuxHistory(sessionName) {
    if (!isTmuxAvailable() || !tmuxSessionExists(sessionName)) return null;
    
    try {
        // Get the complete history including scrollback
        const history = execSync(`tmux capture-pane -t "${sessionName}" -e -p -S -`, { 
            encoding: 'utf8',
            timeout: 5000 
        });
        return history;
    } catch (error) {
        console.error(`Failed to get tmux history for ${sessionName}:`, error);
        return null;
    }
}

// Simple local implementation of sendApiResponse
function sendApiResponse(res, statusCode, success, data = null, error = null) {
    const response = { success };
    
    if (success && data !== null) {
        response.data = data;
    }
    
    if (!success && error) {
        response.error = error;
    }
    
    res.writeHead(statusCode, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(response));
}


/**
 * Create or attach to the global tmux session
 * @param {string} workingDirectory - Working directory
 * @param {string} shell - Shell to use
 * @param {Object} env - Environment variables
 * @returns {Object} - PTY process and tmux session name
 */
function createOrAttachGlobalTmuxSession(workingDirectory, shell, env) {
    const tmuxSessionName = 'qoom_global_terminal';
    let ptyProcess;
    
    if (isTmuxAvailable()) {
        let existingSession = false;
        let bufferContent = null;
        
        // Check if tmux session already exists
        if (tmuxSessionExists(tmuxSessionName)) {
            console.log(`Attaching to existing tmux session: ${tmuxSessionName}`);
            existingSession = true;
            
            // Capture existing buffer content before attaching
            bufferContent = getTmuxHistory(tmuxSessionName);
            
            // Attach to existing session
            ptyProcess = pty.spawn('tmux', ['attach-session', '-t', tmuxSessionName], {
                name: 'xterm-256color',
                cols: 80,
                rows: 30,
                cwd: workingDirectory,
                env: env
            });
        } else {
            console.log(`Creating new tmux session: ${tmuxSessionName}`);
            // Create new tmux session (detached - completes immediately)
            try {
                execSync(`tmux new-session -d -s "${tmuxSessionName}" -c "${workingDirectory}" ${shell}`, {
                    env: env,
                    stdio: 'ignore'
                });
                console.log(`Tmux session ${tmuxSessionName} created successfully`);
            } catch (error) {
                console.error(`Failed to create tmux session: ${error.message}`);
                throw error;
            }
            
            // Now attach to the created session with a PTY process
            ptyProcess = pty.spawn('tmux', ['attach-session', '-t', tmuxSessionName], {
                name: 'xterm-256color',
                cols: 80,
                rows: 30,
                cwd: workingDirectory,
                env: env
            });
        }
        
        return { 
            ptyProcess, 
            tmuxSession: tmuxSessionName, 
            persistent: true, 
            existingSession,
            bufferContent 
        };
    } else {
        console.log('Tmux not available, creating regular terminal session');
        // Fallback to regular terminal
        ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 30,
            cwd: workingDirectory,
            env: env
        });
        
        return { ptyProcess, tmuxSession: null, persistent: false, existingSession: false, bufferContent: null };
    }
}

/**
 * Add WebSocket client to the global session
 * @param {WebSocket} ws - WebSocket connection
 */
function addClientToGlobalSession(ws) {
    if (!globalTerminalSession) {
        console.error('Global terminal session not initialized');
        return;
    }
    
    // Add this WebSocket to the clients list
    if (!globalTerminalSession.clients) {
        globalTerminalSession.clients = new Set();
    }
    globalTerminalSession.clients.add(ws);
    
    // Handle client disconnect
    ws.on('close', () => {
        if (globalTerminalSession && globalTerminalSession.clients) {
            globalTerminalSession.clients.delete(ws);
            console.log(`Client disconnected from global session. Remaining clients: ${globalTerminalSession.clients.size}`);
        }
    });
    
    console.log(`Client added to global session. Total clients: ${globalTerminalSession.clients.size}`);
}

/**
 * Broadcast data to all connected clients
 * @param {string} data - Data to broadcast
 */
function broadcastToClients(data) {
    if (!globalTerminalSession || !globalTerminalSession.clients) return;
    
    const message = JSON.stringify({
        type: 'output',
        data: data
    });
    
    globalTerminalSession.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

/**
 * Initialize the global terminal session
 * @param {string} workingDirectory - Working directory
 * @param {string} shell - Shell to use
 * @param {Object} env - Environment variables
 */
function initializeGlobalSession(workingDirectory, shell, env) {
    if (globalTerminalSession) {
        console.log('Global terminal session already exists');
        return;
    }
    
    console.log('Initializing global terminal session');
    
    // Create or attach to the global tmux session
    const { ptyProcess, tmuxSession, persistent, existingSession, bufferContent } = createOrAttachGlobalTmuxSession(workingDirectory, shell, env);
    
    globalTerminalSession = {
        sessionId: GLOBAL_SESSION_ID,
        ptyProcess,
        created: Date.now(),
        cwd: workingDirectory,
        tmuxSession,
        shell,
        persistent,
        existingSession,
        terminalBuffer: bufferContent,
        clients: new Set()
    };
    
    // Handle terminal output - broadcast to all clients
    ptyProcess.onData((data) => {
        broadcastToClients(data);
    });
    
    // Handle terminal exit
    ptyProcess.onExit((code, signal) => {
        console.log(`Global terminal process exited: ${code}, ${signal}`);
        
        // Notify all clients
        const exitMessage = JSON.stringify({
            type: 'exit',
            code,
            signal
        });
        
        if (globalTerminalSession.clients) {
            globalTerminalSession.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(exitMessage);
                }
            });
        }
        
        // Reset global session
        globalTerminalSession = null;
    });
    
    // Save session state for persistence
    saveSessionState(GLOBAL_SESSION_ID, globalTerminalSession);
    
    // Set up periodic buffer capture for persistent sessions
    if (persistent && tmuxSession) {
        const bufferCaptureInterval = setInterval(() => {
            if (globalTerminalSession) {
                const currentBuffer = captureTmuxBuffer(tmuxSession);
                if (currentBuffer) {
                    globalTerminalSession.terminalBuffer = currentBuffer;
                    saveSessionState(GLOBAL_SESSION_ID, globalTerminalSession);
                }
            } else {
                // Session no longer exists, clear interval
                clearInterval(bufferCaptureInterval);
            }
        }, 30000); // Capture buffer every 30 seconds
        
        globalTerminalSession.bufferCaptureInterval = bufferCaptureInterval;
    }
    
    console.log(`Global terminal session initialized: CWD: ${workingDirectory}, Shell: ${shell}, Tmux: ${tmuxSession || 'none'}`);
}

/**
 * Terminal WebSocket handler for unified router
 * @param {WebSocket} ws - WebSocket connection
 * @param {http.IncomingMessage} req - HTTP request object
 */
function terminalWebSocketHandler(ws, req) {
    console.log('[TERMINAL] New WebSocket connection to global session');

    try {
        // Parse URL to get working directory
        const url = new URL(req.url, `http://${req.headers.host}`);
        const customCwd = url.searchParams.get('cwd');
        const workingDirectory = customCwd || process.cwd();
        
        // Determine shell
        let shell;
        if (process.platform === 'win32') {
            shell = 'powershell.exe';
        } else if (process.platform === 'darwin') {
            shell = '/bin/zsh';
        } else {
            shell = 'bash';
        }
        
        // Create environment with proper prompt settings
        const env = { ...process.env };
        
        // Force locale settings to prevent manpath errors and locale warnings
        // Using C.UTF-8 as it's universally available, unlike en_US.UTF-8
        env.LANG = 'C.UTF-8';
        env.LC_ALL = 'C.UTF-8';
        env.LC_CTYPE = 'C.UTF-8';
        env.LC_NUMERIC = 'C.UTF-8';
        env.LC_TIME = 'C.UTF-8';
        env.LC_COLLATE = 'C.UTF-8';
        env.LC_MONETARY = 'C.UTF-8';
        env.LC_MESSAGES = 'C.UTF-8';
        env.LC_PAPER = 'C.UTF-8';
        env.LC_NAME = 'C.UTF-8';
        env.LC_ADDRESS = 'C.UTF-8';
        env.LC_TELEPHONE = 'C.UTF-8';
        env.LC_MEASUREMENT = 'C.UTF-8';
        env.LC_IDENTIFICATION = 'C.UTF-8';
        
        // Set up proper prompt for different shells
        if (shell === '/bin/zsh') {
            env.PS1 = '%n@%m:%~$ ';
            env.PROMPT = '%n@%m:%~$ ';
            env.ZSH_DISABLE_COMPFIX = 'true';
        } else if (shell === 'bash') {
            env.PS1 = '\\u@\\h:\\w\\$ ';
            env.PROMPT_COMMAND = 'echo -ne "\\033]0;${USER}@${HOSTNAME}: ${PWD}\\007"';
        }
        
        // Initialize global session if it doesn't exist
        if (!globalTerminalSession) {
            console.log('[TERMINAL] Initializing global session...');
            initializeGlobalSession(workingDirectory, shell, env);
        } else {
            console.log('[TERMINAL] Using existing global session');
        }
        
        // Add this client to the global session
        addClientToGlobalSession(ws);
    } catch (error) {
        console.error('[TERMINAL] Error in terminalWebSocketHandler:', error);
        ws.close(1011, 'Internal server error');
        return;
    }

    // Handle WebSocket messages
    ws.on('message', (message) => {
        try {
            // Convert Buffer to string if needed
            const messageStr = Buffer.isBuffer(message) ? message.toString('utf8') : message;
            const data = JSON.parse(messageStr);
            
            if (!globalTerminalSession) {
                console.error('No global terminal session available');
                return;
            }
            
            switch (data.type) {
                case 'input':
                    if (globalTerminalSession.ptyProcess) {
                        globalTerminalSession.ptyProcess.write(data.data);
                    } else {
                        console.error('PTY process not available');
                    }
                    break;
                case 'resize':
                    if (globalTerminalSession.ptyProcess) {
                        globalTerminalSession.ptyProcess.resize(data.cols, data.rows);
                    } else {
                        console.error('PTY process not available');
                    }
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
            console.error('Message received:', message);
        }
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
        console.error('Terminal WebSocket error:', error);
    });

    // Send session info to the client
    const sessionInfo = {
        type: 'session',
        sessionId: GLOBAL_SESSION_ID,
        shell: globalTerminalSession ? globalTerminalSession.shell : shell,
        platform: process.platform,
        persistent: globalTerminalSession ? globalTerminalSession.persistent : true,
        tmuxSession: globalTerminalSession ? globalTerminalSession.tmuxSession : 'qoom_global_terminal',
        recovered: false,
        existingSession: globalTerminalSession ? globalTerminalSession.existingSession : false,
        bufferContent: globalTerminalSession ? globalTerminalSession.terminalBuffer : null
    };
    
    ws.send(JSON.stringify(sessionInfo));
}

/**
 * Reset the global terminal session
 * @param {http.IncomingMessage} req - HTTP request object
 * @param {http.ServerResponse} res - HTTP response object
 */
function resetGlobalSession(req, res) {
    try {
        console.log('Resetting global terminal session');
        
        if (globalTerminalSession) {
            // Notify all clients about the reset
            const resetMessage = JSON.stringify({
                type: 'reset',
                message: 'Terminal session is being reset...'
            });
            
            if (globalTerminalSession.clients) {
                globalTerminalSession.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(resetMessage);
                    }
                });
            }
            
            // Kill the current session
            if (globalTerminalSession.ptyProcess) {
                globalTerminalSession.ptyProcess.kill('SIGTERM');
            }
            
            // Clear buffer capture interval if it exists
            if (globalTerminalSession.bufferCaptureInterval) {
                clearInterval(globalTerminalSession.bufferCaptureInterval);
            }
            
            // Remove session state
            removeSessionState(GLOBAL_SESSION_ID);
            
            // Reset the global session
            globalTerminalSession = null;
        }
        
        // Send success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'Global terminal session has been reset'
        }));
        
    } catch (error) {
        console.error('Error resetting global terminal session:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            error: 'Failed to reset terminal session'
        }));
    }
}

/**
 * Register terminal WebSocket handler with unified router
 * @param {WebSocketRouter} wsRouter - WebSocket router instance
 */
function registerTerminalWebSocket(wsRouter) {
    wsRouter.addRoute('/terminal/_ws', terminalWebSocketHandler);
    
    // Setup cleanup interval if not already set
    if (!registerTerminalWebSocket.cleanupStarted) {
        // Cleanup inactive global session periodically
        setInterval(() => {
            if (globalTerminalSession) {
                const now = Date.now();
                const clientCount = globalTerminalSession.clients ? globalTerminalSession.clients.size : 0;
                
                // If no clients for more than 1 hour, consider cleanup
                if (clientCount === 0 && (now - globalTerminalSession.created > 60 * 60 * 1000)) {
                    console.log('No clients connected to global session for over 1 hour, preserving session but capturing buffer');
                    
                    // Capture final buffer state
                    if (globalTerminalSession.tmuxSession) {
                        const finalBuffer = captureTmuxBuffer(globalTerminalSession.tmuxSession);
                        if (finalBuffer) {
                            globalTerminalSession.terminalBuffer = finalBuffer;
                            saveSessionState(GLOBAL_SESSION_ID, globalTerminalSession);
                        }
                    }
                }
            }
        }, 60 * 60 * 1000); // Check every hour
        
        registerTerminalWebSocket.cleanupStarted = true;
    }
}

/**
 * Generate unique session ID
 * @returns {string} - Unique session ID
 */
function generateSessionId() {
    return 'terminal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Get terminal session info
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function getSessionInfo(req, res) {
    const clientCount = globalTerminalSession && globalTerminalSession.clients ? globalTerminalSession.clients.size : 0;
    const isActive = globalTerminalSession !== null;
    
    sendApiResponse(res, 200, true, {
        sessionType: 'global',
        isActive,
        clientCount,
        sessionId: GLOBAL_SESSION_ID,
        created: globalTerminalSession ? globalTerminalSession.created : null,
        tmuxSession: globalTerminalSession ? globalTerminalSession.tmuxSession : null,
        platform: process.platform,
        shell: process.platform === 'win32' ? 'powershell.exe' : 'bash',
        tmuxAvailable: isTmuxAvailable()
    });
}

/**
 * Get recoverable sessions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function getRecoverableSessions(req, res) {
    const savedSessions = getSavedSessions();
    const recoverableSessions = [];
    
    for (const sessionId of savedSessions) {
        const sessionState = loadSessionState(sessionId);
        if (sessionState && sessionState.tmuxSession) {
            // Check if tmux session still exists
            if (tmuxSessionExists(sessionState.tmuxSession)) {
                recoverableSessions.push({
                    sessionId,
                    created: sessionState.created,
                    lastActivity: sessionState.lastActivity,
                    cwd: sessionState.cwd,
                    shell: sessionState.shell,
                    tmuxSession: sessionState.tmuxSession
                });
            } else {
                // Clean up orphaned session state
                removeSessionState(sessionId);
            }
        }
    }
    
    sendApiResponse(res, 200, true, { recoverableSessions });
}

/**
 * Clean up orphaned sessions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function cleanupOrphanedSessions(req, res) {
    const savedSessions = getSavedSessions();
    let cleanedCount = 0;
    
    for (const sessionId of savedSessions) {
        const sessionState = loadSessionState(sessionId);
        if (sessionState && sessionState.tmuxSession) {
            if (!tmuxSessionExists(sessionState.tmuxSession)) {
                removeSessionState(sessionId);
                cleanedCount++;
            }
        } else if (sessionState && !sessionState.persistent) {
            // Remove non-persistent sessions that are no longer active
            removeSessionState(sessionId);
            cleanedCount++;
        }
    }
    
    sendApiResponse(res, 200, true, { cleanedCount });
}

// Graceful shutdown handling
function handleGracefulShutdown() {
    console.log('Terminal service shutting down, preserving global session...');
    
    if (globalTerminalSession) {
        // Clean up buffer capture interval
        if (globalTerminalSession.bufferCaptureInterval) {
            clearInterval(globalTerminalSession.bufferCaptureInterval);
        }
        
        if (globalTerminalSession.persistent && globalTerminalSession.tmuxSession) {
            console.log(`Preserving global tmux session: ${globalTerminalSession.tmuxSession}`);
            
            // Capture final buffer state
            const finalBuffer = captureTmuxBuffer(globalTerminalSession.tmuxSession);
            
            saveSessionState(GLOBAL_SESSION_ID, {
                ...globalTerminalSession,
                lastActivity: Date.now(),
                detached: true,
                terminalBuffer: finalBuffer || globalTerminalSession.terminalBuffer
            });
            
            // Notify all clients of server restart
            if (globalTerminalSession.clients) {
                const restartMessage = JSON.stringify({
                    type: 'server_restart',
                    message: 'Server restarting, your session will be preserved. Reconnecting...',
                    sessionId: GLOBAL_SESSION_ID
                });
                
                globalTerminalSession.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(restartMessage);
                    }
                });
            }
            
            // Gracefully detach from tmux
            globalTerminalSession.ptyProcess.kill('SIGTERM');
        } else if (globalTerminalSession.ptyProcess) {
            // For non-persistent sessions, clean up
            globalTerminalSession.ptyProcess.kill();
            removeSessionState(GLOBAL_SESSION_ID);
        }
    }
    
    console.log('Global terminal session preservation complete');
}

// Register shutdown handlers
process.on('SIGTERM', handleGracefulShutdown);
process.on('SIGINT', handleGracefulShutdown);
process.on('SIGUSR2', handleGracefulShutdown); // PM2 reload signal

// Export route configuration for the routing system
const api = {
    prefix: '',
    registerTerminalWebSocket,
    getSessionInfo,
    routes: [
        {
            path: '/terminal',
            method: 'GET',
            handler: (req, res) => {

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(generateTerminalHTML());
            }
        },
        {
            path: '/terminal/',
            method: 'GET',
            handler: (req, res) => {

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(generateTerminalHTML());
            }
        },
        {
            path: '/_api/sessions',
            method: 'GET',
            handler: getSessionInfo
        },
        {
            path: '/_api/sessions/recoverable',
            method: 'GET',
            handler: getRecoverableSessions
        },
        {
            path: '/_api/sessions/cleanup',
            method: 'POST',
            handler: cleanupOrphanedSessions
        },
        {
            path: '/_api/sessions/reset',
            method: 'POST',
            handler: resetGlobalSession
        }
    ],
    websocket: {
        path: '/terminal/_ws',
        handler: terminalWebSocketHandler,
        register: registerTerminalWebSocket
    }
};

export default api; 