# AI Chat Panel Setup Guide

This guide walks you through setting up the AI chat feature in the Terminal applet.

## Overview

The Terminal applet includes an AI Assistant panel that allows users to ask questions about terminal output and get contextual help. The chat connects to a Qoom LLM backend for AI responses.

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Terminal Applet   │     │    Tracer Applet    │     │    Qoom LLM API     │
│   (frontend chat)   │────▶│   /tracer/chat      │────▶│   dev.qoom.io/v1    │
│   POST /chat/message│     │   (TypeScript)      │     │   (or qoom.ai/v1)   │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

**Flow:**
1. User sends a message in the terminal's AI chat panel
2. Frontend calls `POST /chat/message`
3. Chat handler calls the Tracer applet's `/tracer/chat` endpoint
4. Tracer connects to the configured Qoom LLM API and returns the response

## Prerequisites

- Node.js 18+ installed
- npm installed
- Git access to the repository

## Setup Steps

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd qoom2
npm install
```

### 2. Build the Tracer Applet

The Tracer applet is written in TypeScript and must be compiled before use:

```bash
cd applets/tracer
npm install
npm run build
cd ../..
```

This compiles both the backend (TypeScript → JavaScript) and frontend (React → bundle).

### 3. Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp env.example .env
```

Edit `.env` and add/update the following:

```bash
# Qoom LLM API URL (for AI chat features)
# Use https://dev.qoom.io/v1 for development
# Use https://www.qoom.ai/v1 for production
QOOM_LLM_URL=https://dev.qoom.io/v1
```

### 4. Start the Server

```bash
npm start
```

Or with PM2:

```bash
pm2 start ecosystem.config.cjs
```

### 5. Verify the Setup

1. Open the Terminal applet in your browser: `http://localhost:3000/terminal/`
2. You should see a split view with the terminal on the left and AI chat on the right
3. Type a message in the chat input and click "Send"
4. You should receive an AI response

## Configuration Options

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `QOOM_LLM_URL` | Base URL for the Qoom LLM API | `https://www.qoom.ai/v1` |
| `PORT` | Server port | `3000` |

### Switching Between Environments

**Development (dev.qoom.io):**
```bash
QOOM_LLM_URL=https://dev.qoom.io/v1
```

**Production (qoom.ai):**
```bash
QOOM_LLM_URL=https://www.qoom.ai/v1
```

After changing environment variables, restart the server.

## Troubleshooting

### 404 Error on `/chat/message`

**Cause:** The Tracer applet hasn't been built.

**Solution:**
```bash
cd applets/tracer
npm install
npm run build
```

Then restart the server.

### 500 Error or "Internal server error"

**Possible causes:**

1. **Qoom LLM API unreachable** - Check your internet connection and verify the `QOOM_LLM_URL` is correct.

2. **Missing environment variable** - Ensure `QOOM_LLM_URL` is set in your `.env` file.

3. **Server not restarted** - After changing `.env`, restart the server:
   ```bash
   # If using npm
   npm start
   
   # If using PM2
   pm2 restart all
   ```

### Chat Response is Empty or Errors

Check the server logs for more details:

```bash
# If running directly
# Check the terminal output

# If using PM2
pm2 logs
```

### Tracer Build Fails

Ensure you have the correct Node.js version:

```bash
node --version  # Should be 18+
```

If TypeScript errors occur, try:

```bash
cd applets/tracer
rm -rf node_modules dist
npm install
npm run build
```

## Development Tips

### Modifying the Chat UI

The terminal chat frontend is located at:
- `applets/terminaler/frontend/terminal.html` - HTML structure
- `applets/terminaler/frontend/terminal.css` - Styles
- `applets/terminaler/frontend/terminal.js` - JavaScript logic (see `sendChatMessage()` function)

### Modifying the Chat Backend

The chat processing logic is in:
- `applets/editer/components/chat/app.js` - Chat message processing
- `applets/tracer/src/services/qoomChatService.ts` - LLM API connection

After modifying TypeScript files in the tracer, rebuild:

```bash
cd applets/tracer
npm run build
```

### Testing the Chat Endpoint Directly

```bash
curl -X POST http://localhost:3000/tracer/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ]
  }'
```

## Related Documentation

- [Terminal Applet - Persistent Sessions](./PERSISTENT_SESSIONS.md)
- [Tracer Applet README](../tracer/README.md)

## Support

If you encounter issues not covered in this guide, check the server logs and reach out to the team.
