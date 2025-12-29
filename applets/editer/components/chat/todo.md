# Chat Applet Todos
**Purpose**: This chatbot adds chatbot features like cursor prompt to the right side of Qoom service development UI. 
The answer model will use ChatGPT Open API using GPT token.

## ✅ Command+K Feature (COMPLETED)
- [x] **Cursor-style Command+K inline AI assistant**
- [x] Modal UI with context-aware prompting
- [x] Monaco Editor integration with keyboard shortcuts (Cmd+K/Ctrl+K)
- [x] AI response display and code application
- [x] Diff preview for changes
- [x] File context recognition (selection, line, full file)
- [x] Integration with existing chat API

### Command+K Files (in this package):
- `frontend/command-k.css` - Styling for Command+K modal
- `frontend/command-k.html` - HTML template
- `frontend/command-k.js` - Main functionality

### Planning & Design
- [x] **Design chatbot UI/UX** (right panel, input box, chat window, etc.)
- [x] Add Chatbot button below Preview in Qoom codespace
- [x] Design prompt input area similar to Cursor
- [x] Design model selection dropdown (default: Qoom LLM)

## Environment Setup
- [x] Create new applet directory and file structure

## Prototype Implementation (GPT OpenAI)
- [x] **Create basic chat interface with OpenAI GPT-3.5-turbo**
- [x] Implement simple chat UI (input box, message list, send button)
- [x] Set up OpenAI API integration with fallback dummy mode
- [x] Handle API quota exceeded scenarios gracefully
- [x] Implement basic error handling

## Frontend Implementation
- [x] **Implement chatbot UI components** (input box, message list, send button)
- [x] Implement Chatbot toggle below Preview
- [x] Implement prompt input area
- [x] Implement model selection dropdown (default: Qoom LLM)
- [x] Implement "Add Model" button and token input dialog
- [x] Display user-added models in the dropdown
- [x] Render response messages

## Backend/API Implementation
- [x] **Create API to communicate with Qoom LLM and user-added GenAI models**
- [x] Manage and secure tokens (Qoom and user-provided)
- [x] Store user model info securely (local/session storage)
- [x] Manage Qoom LLM as the default model (no user token needed)
- [x] Allow user to add any GenAI model by providing their own token
- [x] Implement data flow: frontend ↔ backend ↔ selected model API
- [x] prompt engineering well..........
- [x] format responses with qoom markdown render

## Error Handling
- [ ] Notify user on API call failure
- [ ] Validate user input and token format
- [ ] Handle invalid/expired tokens gracefully

## Deployment & Documentation
- [ ] Document usage and installation (README, etc.)
- [ ] Document how to add a personal GenAI model/token

## Optional/Future Features
- [ ] stream answering (future)
- [ ] Save/load chat history
- [ ] Provide user-customized prompts