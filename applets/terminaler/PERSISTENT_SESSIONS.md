# Single Global Terminal Session

The terminaler applet uses a single global terminal session that is shared by all users. This session is persistent using tmux integration and survives server restarts and reconnections.

## Features

### 🔄 **Single Shared Session**
- One global terminal session shared by all users
- Session is preserved using tmux when available
- Survives server restarts, PM2 reloads, and network disconnections
- **Terminal buffer/scrollback history is preserved** across page refreshes
- Multiple users can collaborate in the same terminal

### 🚀 **Automatic Connection**
- Always connects to the same global session
- No session management or recovery UI needed
- Instant connection to existing session with full history

### 🛡️ **Graceful Shutdown**
- Server shutdowns preserve all active tmux sessions
- Clients are notified of server restarts
- Automatic reconnection with session recovery

## How It Works

### Backend (api.js)
1. **Global Session**: Maintains one shared tmux session (`qoom_global_terminal`)
2. **Client Broadcasting**: Broadcasts terminal output to all connected clients
3. **Buffer Capture**: Captures and stores terminal scrollback buffer from tmux
4. **Session Persistence**: Saves global session state to filesystem
5. **Graceful Shutdown**: Preserves the global session during server restarts
6. **Periodic Backup**: Captures buffer content every 30 seconds for persistence

### Frontend (terminal.js)
1. **Simplified Connection**: Always connects to the same global session
2. **Enhanced Reconnection**: Exponential backoff with automatic reconnection
3. **Buffer Restoration**: Restores terminal scrollback history on reconnection
4. **Real-time Collaboration**: Multiple users see the same terminal output

## API Endpoints

- `GET /_api/sessions` - Get session information
- `GET /_api/sessions/recoverable` - Get recoverable sessions
- `POST /_api/sessions/cleanup` - Clean up orphaned sessions
- `POST /_api/sessions/reset` - Reset the global terminal session

## Usage

### Simple Usage
1. Open `/terminal` - always connects to the global session
2. Work in terminal normally
3. Multiple users can use the same terminal simultaneously
4. If server restarts, session is preserved
5. Reconnect automatically to the same session with full history

### Collaboration
- All users see the same terminal output in real-time
- Commands run by any user are visible to all users
- Perfect for pair programming or teaching scenarios

### Session Management
- Global session persists indefinitely
- Buffer content is captured every 30 seconds
- Session survives server restarts and PM2 reloads

## Requirements

- **tmux** must be installed on the system for persistence
- Falls back to regular terminal sessions if tmux is not available
- Works on Linux and macOS (tmux required)

## Benefits

1. **No Lost Work**: Terminal session survives server restarts
2. **Preserved History**: Terminal logs and scrollback buffer persist across page refreshes
3. **Seamless Experience**: Automatic connection with minimal user intervention
4. **Real-time Collaboration**: Multiple users can work in the same terminal
5. **Simple Management**: Single session - no complexity
6. **Fallback Support**: Works without tmux (non-persistent mode)

## Technical Details

- Uses global tmux session named `qoom_global_terminal`
- Session state stored in `sessions/global_terminal_session.json`
- Graceful shutdown handlers for SIGTERM, SIGINT, and SIGUSR2
- Enhanced WebSocket reconnection with exponential backoff
- Multiple WebSocket clients connected to the same session
