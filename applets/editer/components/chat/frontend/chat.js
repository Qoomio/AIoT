/**
 * Chat JavaScript
 * 
 * Handles the chat functionality in the Monaco editor interface.
 */
import { marked } from '/view/scripts/marked.esm.js';


'use strict';

let state = null;
let chatContainer = null;
let chatForm = null;
let chatInput = null;
let chatWindow = null;
let chatActions = null;
let clearChatBtn = null;
let sendButton = null;
let agentSelect = null;
let modal = null;   
let addTokenBtn = null;
let closeModal = null;
let cancelModal = null;
let completeModal = null;
let agentTypeBtns = null;
let tokenInput = null;
let fileSelectBtn = null;

let selectedAgent = 'qoom'; // Default agent
let customAgents = []; // Store custom agents
let selectedAgentType = null; // For modal
let selectedFileContext = null; // Store selected file context for LLM
let isStarterMode = false; // Track Starter Mode state

/**
 * Load chat CSS
 */
function loadChatCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="chat.css"]')) {
        return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = '/view/applets/editer/components/chat/frontend/chat.css';
    
    document.head.appendChild(link);
    console.log('Chat CSS loaded');
}

/**
 * Initialize chat template
 */
async function initializeChatTemplate() {
    try {
        const response = await fetch('/view/applets/editer/components/chat/frontend/chat.html');
        const html = await response.text();
        const widgetsContainer = document.querySelector('.widgets-chat');
        if (widgetsContainer) {
            widgetsContainer.innerHTML = html;
            chatContainer = widgetsContainer.querySelector('.chat-content');
            setupChatEvents();
            setupAgentSelector();
            setupStarterMode();
            loadCustomAgents();
            console.log('Chat template loaded');
        }
    } catch (error) {
        console.error('Failed to load chat template:', error);
    }
}

/**
 * Load custom agents from localStorage
 */
function loadCustomAgents() {
    try {
        const saved = localStorage.getItem('qoom_custom_agents');
        if (saved) {
            customAgents = JSON.parse(saved);
            updateAgentDropdown();
        }
    } catch (error) {
        console.error('Failed to load custom agents:', error);
    }
}

/**
 * Save custom agents to localStorage
 */
function saveCustomAgents() {
    try {
        localStorage.setItem('qoom_custom_agents', JSON.stringify(customAgents));
    } catch (error) {
        console.error('Failed to save custom agents:', error);
    }
}

/**
 * Update agent dropdown with custom agents
 */
function updateAgentDropdown() {
    const agentSelect = document.getElementById('agentSelect');
    if (!agentSelect) return;

    // Clear existing options except Qoom Agent
    agentSelect.innerHTML = '<option value="qoom">Qoom Agent</option>';
    
    // Add custom agents
    customAgents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent.id;
        option.textContent = agent.name;
        agentSelect.appendChild(option);
    });
}

/**
 * Close modal handler
 */
function closeModalHandler() {
    const modal = document.getElementById('addAgentModal');
    modal.classList.remove('active');
}

/**
 * Update agent type buttons
 */
function updateAgentTypeButtons() {
    const agentTypeBtns = document.querySelectorAll('.agent-type-btn');
    const tokenInput = document.getElementById('tokenInput');
    
    agentTypeBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.type === selectedAgentType) {
            btn.classList.add('active');
        }
    });
    
    // Disable token input field when Qoom LLM is selected
    if (selectedAgentType === 'qoom') {
        tokenInput.disabled = true;
        tokenInput.placeholder = 'No token required for Qoom LLM';
        tokenInput.value = '';
    } else {
        tokenInput.disabled = false;
        tokenInput.placeholder = 'Enter your API token...';
    }
}

/**
 * Show modal error
 */
function showModalError(message) {
    const errorDiv = document.getElementById('modalError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

/**
 * Hide modal error
 */
function hideModalError() {
    const errorDiv = document.getElementById('modalError');
    errorDiv.style.display = 'none';
}

/**
 * Handle adding new agent
 */
async function handleAddAgent() {
    const tokenInput = document.getElementById('tokenInput');
    const token = tokenInput.value.trim();

    // Validate inputs
    if (!selectedAgentType) {
        showModalError('Please select an agent type');
        return;
    }

    // Qoom LLM doesn't require a token
    if (selectedAgentType !== 'qoom' && !token) {
        showModalError('Please enter a token');
        return;
    }

    // Validate token format (basic validation)
    if (!isValidToken(token, selectedAgentType)) {
        showModalError('Invalid token format');
        return;
    }

    try {
        // Test token validity (skip for Qoom LLM since it doesn't have a token)
        if (selectedAgentType !== 'qoom') {
            const isValid = await testToken(token, selectedAgentType);
            if (!isValid) {
                showModalError('Invalid token. Please check your API key.');
                return;
            }
        }

        // Add agent
        const agentId = `${selectedAgentType}_${Date.now()}`;
        const agentName = getAgentDisplayName(selectedAgentType);
        
        const newAgent = {
            id: agentId,
            type: selectedAgentType,
            name: agentName,
            token: selectedAgentType === 'qoom' ? null : token
        };

        customAgents.push(newAgent);
        saveCustomAgents();
        updateAgentDropdown();

        // Show success message
        showSuccessNotification(`${agentName} added successfully!`);

        // Close modal
        closeModalHandler();

    } catch (error) {
        console.error('Error adding agent:', error);
        showModalError('Failed to add agent. Please try again.');
    }
}

/**
 * Get agent display name
 */
function getAgentDisplayName(type) {
    const names = {
        'qoom': 'Qoom LLM',
        'chatgpt': 'ChatGPT',
        'claude': 'Claude',
        'gemini': 'Gemini'
    };
    return names[type] || 'Custom Agent';
}

/**
 * Basic token validation
 */
function isValidToken(token, type) {
    // Qoom LLM doesn't require a token
    if (type === 'qoom') {
        return true;
    }
    
    if (!token || token.length < 10) return false;
    
    // Basic format validation based on type
    switch (type) {
        case 'chatgpt':
            return token.startsWith('sk-') && token.length > 20;
        case 'claude':
            return token.startsWith('sk-ant-') && token.length > 20;
        case 'gemini':
            return token.length > 20; // Google tokens can vary
        default:
            return token.length > 10;
    }
}

/**
 * Test token validity
 */
async function testToken(token, type) {
    try {
        const response = await fetch('/chat/test-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token, type })
        });

        const data = await response.json();
        return data.valid === true;
    } catch (error) {
        console.error('Token test error:', error);
        // For now, assume valid if we can't test
        return true;
    }
}

function updateFileContextButton() {
    clearChatBtn.style.display = selectedFileContext ? 'block' : 'none';
}

/**
 * Show success notification
 */
function showSuccessNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'success-notification';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * Setup Starter Mode toggle
 */
function setupStarterMode() {
    const starterModeToggle = document.getElementById('starterModeToggle');
    if (starterModeToggle) {
        starterModeToggle.addEventListener('change', function(e) {
            isStarterMode = e.target.checked;
            console.log('Starter Mode:', isStarterMode ? 'ON' : 'OFF');
            
            // Update chat UI to indicate mode
            updateStarterModeUI();
            
            // Add system message about mode change
            const modeMessage = isStarterMode 
                ? 'Starter Mode activated! Ask me to create projects and I\'ll generate them for you.'
                : 'Starter Mode deactivated. Back to normal chat mode.';
            addMessage(modeMessage, 'system');
        });
    }
}

/**
 * Update UI to reflect Starter Mode state
 */
function updateStarterModeUI() {
    const chatContainer = document.querySelector('.chat-container');
    const chatWindow = document.getElementById('chatWindow');
    const chatInput = document.getElementById('chatInput');
    
    if (chatContainer) {
        if (isStarterMode) {
            chatContainer.classList.add('starter-mode');
        } else {
            chatContainer.classList.remove('starter-mode');
        }
    }
    
    if (chatWindow) {
        if (isStarterMode) {
            chatWindow.classList.add('starter-mode');
        } else {
            chatWindow.classList.remove('starter-mode');
        }
    }
    
    // When it's Starter Mode, change input placeholder
    if (chatInput) {
        if (isStarterMode) {
            chatInput.placeholder = "ex. create/make a python project named 'my-app'";
        } else {
            chatInput.placeholder = "Type your message...";
        }
    }
}

/**
 * Setup agent selector
 */
function setupAgentSelector() {
    const agentSelect = document.getElementById('agentSelect');
    if (agentSelect) {
        // Set default agent
        agentSelect.value = selectedAgent;
        
        agentSelect.addEventListener('change', function(e) {
            selectedAgent = e.target.value;
            console.log('Selected agent:', selectedAgent);
            
            // Add system message about agent change
            const agentNames = {
                'qoom': 'Qoom Agent'
            };
            
            // Add custom agent names
            customAgents.forEach(agent => {
                agentNames[agent.id] = agent.name;
            });
            
            const agentName = agentNames[selectedAgent] || 'Unknown Agent';
            addMessage(`Switched to ${agentName}`, 'system');
        });
    }
}

function closeFileSelector() {
    const modal = document.querySelector('.file-selector-modal');
    if (modal) {
        modal.remove();
    }
    selectedFileContext = null;
}

function useSelectedFile() {
    
    chatInput = document.getElementById('chatInput');
    
    // Store file context for LLM
    const { path } = selectedFileContext;
    
    // Add file context indicator to input
    const currentText = chatInput.value;
    const fileIndicator = `[File: ${path}] `;
    
    if (currentText.startsWith('[File:')) {
        // Replace existing file indicator
        chatInput.value = fileIndicator + currentText.substring(currentText.indexOf(']') + 2);
    } else {
        // Add new file indicator
        chatInput.value = fileIndicator + currentText;
    }
    
    chatInput.focus();
    
    // Show success notification
    showSuccessNotification(`File "${path}" selected for context`);
    
    // Update clear button visibility
    updateFileContextButton();
    
    closeFileSelector();
}

/**
 * Show file selector modal
 */
function showFileSelector() {
    // Create file selector modal
    const modal = document.createElement('div');
    modal.className = 'file-selector-modal modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Select File for Context</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="file-selector-tree" id="fileSelectorTree">
                    <div class="loading">Loading files...</div>
                </div>
                <div class="selected-file-info" id="selectedFileInfo" style="display: none;">
                    <h4>Selected File:</h4>
                    <p id="selectedFilePath"></p>
                    <div class="file-preview" id="filePreview"></div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary">Cancel</button>
                <button type="button" class="btn-primary" id="useFileBtn" disabled>Use File</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.classList.add('active');

    const closeModal = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.btn-secondary');
    const useFileBtn = modal.querySelector('.btn-primary');

    closeModal.addEventListener('click', closeFileSelector);
    cancelBtn.addEventListener('click', closeFileSelector);
    useFileBtn.addEventListener('click', useSelectedFile);

    loadFileSelectorTree();
}

/**
 * Load file tree for selector
 */
async function loadFileSelectorTree() {
    try {
        const response = await fetch('/editer/explorer/_api/directory?path=.');
        const data = await response.json();
        
        if (data.success) {
            const treeContainer = document.getElementById('fileSelectorTree');
            treeContainer.innerHTML = createFileSelectorTreeHTML(data.data.contents);
            attachFileSelectorEvents();
        } else {
            document.getElementById('fileSelectorTree').innerHTML = '<div class="error">Failed to load files</div>';
        }
    } catch (error) {
        console.error('Failed to load file tree:', error);
        document.getElementById('fileSelectorTree').innerHTML = '<div class="error">Error loading files</div>';
    }
}

/**
 * Create file selector tree HTML
 */
function createFileSelectorTreeHTML(items, parentPath = '', level = 0) {
    let html = '';
    items.forEach(item => {
        const itemPath = parentPath ? parentPath + '/' + item.name : item.name;
        html += `
            <div class="file-selector-item" data-path="${itemPath}" data-is-directory="${item.isDirectory}">
                <span class="file-icon">${item.isDirectory ? '📁' : '📄'}</span>
                <span class="file-name">${item.name}</span>
                ${item.isDirectory ? '<span class="expand-icon">▶</span>' : ''}
            </div>
        `;
    });
    return html;
}

/**
 * Attach events to file selector tree
 */
function attachFileSelectorEvents() {
    const fileItems = document.querySelectorAll('.file-selector-item');
    fileItems.forEach(item => {
        item.addEventListener('click', handleFileSelectorClick);
    });
}

/**
 * Handle file selector click
 */
async function handleFileSelectorClick(e) {
    const item = e.currentTarget;
    const path = item.dataset.path;
    const isDirectory = item.dataset.isDirectory === 'true';
    
    // Clear previous selection
    document.querySelectorAll('.file-selector-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    
    if (isDirectory) {
        // Toggle directory expansion
        const isExpanded = item.classList.contains('expanded');
        if (!isExpanded) {
            await loadDirectoryContents(item, path);
        }
        item.classList.toggle('expanded');
    } else {
        // Select file
        await selectFileForContext(path);
    }
}

/**
 * Load directory contents
 */
async function loadDirectoryContents(parentItem, dirPath) {
    try {
        const response = await fetch(`/editer/explorer/_api/directory?path=${encodeURIComponent(dirPath)}`);
        const data = await response.json();
        
        if (data.success) {
            // Create nested items
            const nestedHtml = createFileSelectorTreeHTML(data.data.contents, dirPath, 1);
            const nestedContainer = document.createElement('div');
            nestedContainer.className = 'nested-items';
            nestedContainer.innerHTML = nestedHtml;
            
            // Insert after parent item
            parentItem.parentNode.insertBefore(nestedContainer, parentItem.nextSibling);
            
            // Attach events to new items
            nestedContainer.querySelectorAll('.file-selector-item').forEach(item => {
                item.addEventListener('click', handleFileSelectorClick);
            });
        }
    } catch (error) {
        console.error('Failed to load directory:', error);
    }
}

/**
 * Select file for context
 */
async function selectFileForContext(filePath) {
    try {
        // Show loading state
        document.getElementById('selectedFileInfo').style.display = 'block';
        document.getElementById('selectedFilePath').textContent = filePath;
        document.getElementById('filePreview').textContent = 'Loading...';
        document.getElementById('useFileBtn').disabled = true;
        
        // Read file content
        const response = await fetch('/editer/explorer/_api/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const content = data.data.content;
            const preview = content.length > 300 ? content.substring(0, 300) + '...' : content;

            selectedFileContext = {
                path: filePath,
                content: content
            };
            
            document.getElementById('filePreview').textContent = preview;
            document.getElementById('useFileBtn').disabled = false;
        } else {
            document.getElementById('filePreview').textContent = 'Error loading file';
        }
    } catch (error) {
        console.error('Failed to load file:', error);
        document.getElementById('filePreview').textContent = 'Error loading file';
    }
}


/**
 * Clear file context
 */
function clearFileContext() {
    selectedFileContext = null;
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        // Remove file indicator from input
        const currentText = chatInput.value;
        if (currentText.startsWith('[File:')) {
            chatInput.value = currentText.substring(currentText.indexOf(']') + 2);
        }
    }
    showSuccessNotification('File context cleared');
}

function handleAgentChange(e) {
    selectedAgent = e.target.value;
    console.log('Selected agent:', selectedAgent);
    
    // Add system message about agent change
    const agentNames = {
        'qoom': 'Qoom Agent'
    };
    
    // Add custom agent names
    customAgents.forEach(agent => {
        agentNames[agent.id] = agent.name;
    });
    
    const agentName = agentNames[selectedAgent] || 'Unknown Agent';
    addMessage(`Switched to ${agentName}`, 'system');
}

function setLoading(loading) {
    sendButton.disabled = loading;
    if (loading) {
        sendButton.innerHTML = '<div class="loading"></div>';
    } else {
        sendButton.textContent = 'Send';
    }
}

function renderMarkdown(content) {    
    try {
        // Only process code blocks, leave everything else as plain text
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let processedContent = content;
        let match;
        
        while ((match = codeBlockRegex.exec(content)) !== null) {
            const fullMatch = match[0];
            const language = match[1] || 'text';
            const code = match[2];
            
            // Create the styled code block
            const styledCodeBlock = `<pre class="code-block ${language}" data-lang="${language}"><code class="language-${language}">${code}</code></pre>`;
            
            // Replace the original code block with styled version
            processedContent = processedContent.replace(fullMatch, styledCodeBlock);
        }
        
        return processedContent;
    } catch (error) {
        console.error('Markdown rendering error:', error);
        return content; // Fallback to plain text
    }
}

function addMessage(content, type = 'bot') {

    const message = document.createElement('div');
    message.className = `message ${type}`;
    
    // Add agent indicator for bot messages
    if (type === 'bot') {
        const agentNames = {
            'qoom': 'Qoom Agent'
        };
        
        // Add custom agent names
        customAgents.forEach(agent => {
            agentNames[agent.id] = agent.name;
        });
        
        const agentName = agentNames[selectedAgent] || 'Agent';
        
        // Create agent indicator element
        const agentIndicator = document.createElement('strong');
        agentIndicator.textContent = `${agentName}: `;
        message.appendChild(agentIndicator);
        
        // Render only code blocks, leave other content as plain text
        const renderedContent = renderMarkdown(content);
        
        // Create a container for the content
        const contentContainer = document.createElement('div');
        contentContainer.innerHTML = renderedContent;
        message.appendChild(contentContainer);
        
    } else {
        // For user messages, just use plain text
        message.textContent = content;
    }
    
    chatWindow.appendChild(message);
    
    setTimeout(() => {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }, 50);
}

async function sendMessage(message) {
    try {
        setLoading(true);
        
        // Get agent info
        let agentInfo = { type: 'qoom', token: null };
        if (selectedAgent !== 'qoom') {
            const customAgent = customAgents.find(agent => agent.id === selectedAgent);
            if (customAgent) {
                agentInfo = { type: customAgent.type, token: customAgent.token };
            }
        }
        
        // Prepare message with file context if available
        let messageWithContext = message;
        let fileContextInfo = null;
        
        if (selectedFileContext) {
            // Remove file indicator from message
            const cleanMessage = message.replace(/^\[File:.*?\]\s*/, '');
            
            // Add file context to message
            messageWithContext = `File Context:
File: ${selectedFileContext.path}
Content:
\`\`\`
${selectedFileContext.content}
\`\`\`

User Question: ${cleanMessage}`;
            
            fileContextInfo = {
                path: selectedFileContext.path,
                hasContext: true
            };
            
            console.log('Sending file context:', fileContextInfo);
            console.log('Message with context:', messageWithContext);
        }
        
        const response = await fetch('/chat/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                message: messageWithContext,
                agent: selectedAgent,
                agentInfo,
                fileContext: fileContextInfo,
                isStarterMode: isStarterMode  // Add Starter Mode state
            })
        });

        const data = await response.json();
        
        if (data.success) {
            addMessage(data.message, 'bot');
            
            // Check if in Starter Mode and process code blocks for project creation
            // This works for all agents now since the AI response should contain proper code blocks
            if (isStarterMode) {
                await processStarterModeResponse(data.message, message);
            }
        } else {
            addMessage(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('API call error:', error);
        addMessage('Server connection error occurred.', 'error');
    } finally {
        setLoading(false);
    }
}

async function submitChatForm(e) {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    chatInput.value = '';
    await sendMessage(text);
}


/**
 * Process AI response in Starter Mode for project creation
 */
async function processStarterModeResponse(aiResponse, userMessage) {
    try {
        // Parse project information from user message and AI response
        const projectInfo = extractProjectInfo(userMessage, aiResponse);
        
        if (projectInfo.hasProject) {
            // Check if essential information is missing
            const missingInfo = validateProjectInfo(projectInfo, userMessage);
            
            if (missingInfo.length > 0) {
                // Ask for missing information as a bot response (more natural)
                const clarificationMessage = generateClarificationMessage(missingInfo);
                addMessage(clarificationMessage, 'bot');
                return;
            }
            
            addMessage('🔍 Project detected! Analyzing code blocks...', 'system');
            
            // Extract code blocks from AI response
            const codeBlocks = extractCodeBlocks(aiResponse);
            
            if (codeBlocks.length > 0) {
                addMessage(`📁 Found ${codeBlocks.length} file(s). Creating project "${projectInfo.projectName}"...`, 'system');
                
                // Create project with detected language and files
                const result = await createProjectFromAI(projectInfo.projectName, projectInfo.language, codeBlocks);
                
                if (result.success) {
                    addMessage(`✅ Project "${projectInfo.projectName}" created successfully!`, 'system');
                    addMessage(`📂 Files created: ${result.files.join(', ')}`, 'system');
                    
                    // Add View Project button instead of auto-redirect
                    addProjectViewButton(projectInfo.projectName, result.files);
                } else {
                    addMessage(`❌ Failed to create project: ${result.error}`, 'error');
                }
            } else {
                addMessage('ℹ️ No code blocks found in response. Please ask me to create specific files.', 'system');
            }
        }
    } catch (error) {
        console.error('Error processing Starter Mode response:', error);
        addMessage(`❌ Error processing project: ${error.message}`, 'error');
    }
}

/**
 * Enhanced project information extraction
 */
function extractProjectInfo(userMessage, aiResponse) {
    // Look for project name patterns in user message (더 포괄적으로)
    const projectNamePatterns = [
        // 기존 따옴표 패턴들
        /["']([^"']+)["'].*?(?:project|프로젝트)/i,
        /(?:project|프로젝트).*?["']([^"']+)["']/i,
        /(?:name|이름|called).*?["']([^"']+)["']/i,
        /(?:create|만들|생성).*?["']([^"']+)["']/i,
        
        // 새로운 자연어 패턴들 (따옴표 없이)
        /(?:named|called|이름)\s+([a-zA-Z][a-zA-Z0-9_-]*)/i,
        /(?:project|프로젝트)\s+(?:named|called|이름)\s+([a-zA-Z][a-zA-Z0-9_-]*)/i,
        /(?:create|make|build|만들|생성)\s+.*?(?:project|프로젝트).*?(?:named|called|이름)\s+([a-zA-Z][a-zA-Z0-9_-]*)/i,
        /(?:project|프로젝트)\s+([a-zA-Z][a-zA-Z0-9_-]*)/i,
        // "a java project that named xxx" 패턴
        /(?:project|프로젝트)\s+that\s+(?:named|called|이름)\s+([a-zA-Z][a-zA-Z0-9_-]*)/i
    ];
    
    let projectName = null;
    for (const pattern of projectNamePatterns) {
        const match = userMessage.match(pattern);
        if (match) {
            projectName = match[1];
            break;
        }
    }
    
    // Detect language from user message or AI response (enhanced)
    const language = detectLanguageEnhanced(userMessage + ' ' + aiResponse);
    
    // Check if this looks like a project creation request
    const hasProject = /(?:create|make|build|generate|만들|생성|구현).*?(?:project|프로젝트|app|application|앱)/i.test(userMessage) ||
                      codeBlocksExist(aiResponse);
    
    return {
        hasProject,
        projectName: projectName ? sanitizeProjectName(projectName) : null,
        language,
        hasExplicitName: !!projectName,
        hasExplicitLanguage: detectExplicitLanguage(userMessage)
    };
}

/**
 * Validate if project has essential information
 */
function validateProjectInfo(projectInfo, userMessage) {
    const missing = [];
    
    // Check if project name is missing or auto-generated
    if (!projectInfo.hasExplicitName || !projectInfo.projectName) {
        missing.push('project_name');
    }
    
    // Check if language is unclear or defaulted
    if (!projectInfo.hasExplicitLanguage || projectInfo.language === 'unknown') {
        missing.push('language');
    }
    
    return missing;
}

/**
 * Generate clarification message for missing information
 */
function generateClarificationMessage(missingInfo) {
    let message = "I'd love to help you create a project! 🚀 However, I need a bit more information:\n\n";
    
    if (missingInfo.includes('project_name')) {
        message += "**📝 Project Name**: What would you like to call your project?\n";
    }
    
    if (missingInfo.includes('language')) {
        message += "**💻 Programming Language**: Which language or framework should I use?\n";
        message += "   *(Examples: Python, JavaScript, React, Vue, Java, Go, etc.)*\n";
    }
    
    message += "\nOnce you provide these details, I'll create your project with all the necessary files! ✨";
    
    return message;
}

/**
 * Enhanced language detection supporting more languages
 */
function detectLanguageEnhanced(text) {
    const lowerText = text.toLowerCase();
    
    // Programming languages
    if (lowerText.includes('python') || lowerText.includes('파이썬') || lowerText.includes('.py')) return 'python';
    if (lowerText.includes('javascript') || lowerText.includes('js') || lowerText.includes('.js')) return 'javascript';
    if (lowerText.includes('typescript') || lowerText.includes('ts') || lowerText.includes('.ts')) return 'typescript';
    if (lowerText.includes('java') && !lowerText.includes('javascript')) return 'java';
    if (lowerText.includes('c++') || lowerText.includes('cpp')) return 'cpp';
    if (lowerText.includes('c#') || lowerText.includes('csharp')) return 'csharp';
    if (lowerText.includes(' c ') || lowerText.includes('.c') && !lowerText.includes('c++')) return 'c';
    if (lowerText.includes('go') || lowerText.includes('golang')) return 'go';
    if (lowerText.includes('rust') || lowerText.includes('.rs')) return 'rust';
    if (lowerText.includes('php') || lowerText.includes('.php')) return 'php';
    if (lowerText.includes('ruby') || lowerText.includes('.rb')) return 'ruby';
    if (lowerText.includes('swift') || lowerText.includes('.swift')) return 'swift';
    if (lowerText.includes('kotlin') || lowerText.includes('.kt')) return 'kotlin';
    
    // Frameworks and environments
    if (lowerText.includes('react') || lowerText.includes('리액트')) return 'react';
    if (lowerText.includes('vue') || lowerText.includes('뷰')) return 'vue';
    if (lowerText.includes('angular') || lowerText.includes('앵귤러')) return 'angular';
    if (lowerText.includes('node') || lowerText.includes('nodejs')) return 'nodejs';
    if (lowerText.includes('express')) return 'nodejs';
    if (lowerText.includes('django') || lowerText.includes('flask')) return 'python';
    if (lowerText.includes('spring')) return 'java';
    if (lowerText.includes('web') || lowerText.includes('html') || lowerText.includes('css') || lowerText.includes('웹')) return 'web';
    
    return 'unknown';
}

/**
 * Detect if language was explicitly mentioned
 */
function detectExplicitLanguage(text) {
    const languageKeywords = [
        'python', 'javascript', 'typescript', 'java', 'cpp', 'c++', 'csharp', 'c#',
        'go', 'rust', 'php', 'ruby', 'swift', 'kotlin',
        'react', 'vue', 'angular', 'nodejs', 'django', 'flask', 'spring',
        '파이썬', '자바스크립트', '리액트', '뷰', '앵귤러'
    ];
    
    return languageKeywords.some(keyword => 
        text.toLowerCase().includes(keyword.toLowerCase())
    );
}

/**
 * Sanitize project name for file system
 */
function sanitizeProjectName(name) {
    if (!name) return null;
    return name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase().substring(0, 50);
}

/**
 * Check if code blocks exist in response
 */
function codeBlocksExist(response) {
    return /```[\s\S]*?```/g.test(response);
}

/**
 * Extract code blocks from AI response
 */
function extractCodeBlocks(response) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;
    
    while ((match = codeBlockRegex.exec(response)) !== null) {
        const language = match[1] || 'text';
        const code = match[2].trim();
        
        // Try to determine filename from code content or language
        let filename = determineFilename(code, language);
        
        codeBlocks.push({
            language,
            code,
            filename
        });
    }
    
    return codeBlocks;
}

/**
 * Enhanced filename determination for various languages
 */
function determineFilename(code, language) {
    // Look for filename comments in code
    const filenameComment = code.match(/(?:\/\/|#|<!--)\s*(?:filename|file):\s*(.+)/i);
    if (filenameComment) {
        return filenameComment[1].trim();
    }
    
    // Language-specific patterns
    if (code.includes('if __name__ == "__main__"') || code.includes('import ')) return 'main.py';
    if (code.includes('package.json') || code.includes('"name":')) return 'package.json';
    if (code.includes('<!DOCTYPE html') || code.includes('<html')) return 'index.html';
    if (code.includes('body {') || code.includes('* {')) return 'style.css';
    if (code.includes('int main(') || code.includes('#include')) return 'main.c';
    if (code.includes('public static void main') || code.includes('public class')) return 'Main.java';
    if (code.includes('fn main()') || code.includes('use std::')) return 'main.rs';
    if (code.includes('func main()') || code.includes('package main')) return 'main.go';
    if (code.includes('#include <iostream>')) return 'main.cpp';
    if (code.includes('using System') || code.includes('namespace ')) return 'Program.cs';
    
    // Default filenames based on language
    const defaultFilenames = {
        'python': 'main.py',
        'javascript': 'index.js',
        'typescript': 'index.ts',
        'java': 'Main.java',
        'cpp': 'main.cpp',
        'csharp': 'Program.cs',
        'c': 'main.c',
        'go': 'main.go',
        'rust': 'main.rs',
        'php': 'index.php',
        'ruby': 'main.rb',
        'swift': 'main.swift',
        'kotlin': 'Main.kt',
        'react': 'App.jsx',
        'vue': 'App.vue',
        'angular': 'app.component.ts',
        'nodejs': 'index.js',
        'web': 'index.html',
        'html': 'index.html',
        'css': 'style.css',
        'json': 'package.json',
        'md': 'README.md',
        'markdown': 'README.md'
    };
    
    return defaultFilenames[language] || `main.${getFileExtension(language)}`;
}

/**
 * Get file extension for language
 */
function getFileExtension(language) {
    const extensions = {
        'python': 'py',
        'javascript': 'js',
        'typescript': 'ts',
        'java': 'java',
        'cpp': 'cpp',
        'csharp': 'cs',
        'c': 'c',
        'go': 'go',
        'rust': 'rs',
        'php': 'php',
        'ruby': 'rb',
        'swift': 'swift',
        'kotlin': 'kt',
        'react': 'jsx',
        'vue': 'vue',
        'angular': 'ts'
    };
    
    return extensions[language] || 'txt';
}

/**
 * Create project from AI-generated code blocks
 */
async function createProjectFromAI(projectName, language, codeBlocks) {
    try {
        const response = await fetch('/chat/create-project', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                projectName,
                language,
                codeBlocks
            })
        });
        
        const data = await response.json();
        return data;
        
    } catch (error) {
        console.error('Error creating project from AI:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

function setupChatEvents() {

    chatForm.addEventListener('submit', async function(e) {
        await submitChatForm(e);
    });

    chatInput.addEventListener('keypress', async function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            await submitChatForm(e);
        }
    });
    
    agentSelect.addEventListener('change', function(e) {
        handleAgentChange(e);
    });

    addTokenBtn.addEventListener('click', () => {
        modal.classList.add('active');
        selectedAgentType = null;
        tokenInput.value = '';
        hideModalError();
        updateAgentTypeButtons();
    });

    closeModal.addEventListener('click', closeModalHandler);
    cancelModal.addEventListener('click', closeModalHandler);


    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModalHandler();
        }
    });

    agentTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectedAgentType = btn.dataset.type;
            updateAgentTypeButtons();
        });
    });

    completeModal.addEventListener('click', handleAddAgent);

    tokenInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleAddAgent();
        }
    });

    fileSelectBtn.addEventListener('click', showFileSelector);

    clearChatBtn.addEventListener('click', clearFileContext);
}

function initializeChat() {
    chatWindow = document.getElementById('chatWindow');
    chatContainer = document.querySelector('.chat-content');
    chatForm = document.getElementById('chatForm');
    chatInput = document.getElementById('chatInput');
    chatActions = document.querySelector('.chat-actions');
    sendButton = document.getElementById('sendButton');
    agentSelect = document.getElementById('agentSelect');
    modal = document.getElementById('addAgentModal');
    addTokenBtn = document.getElementById('addTokenBtn');
    closeModal = document.getElementById('closeModal');
    cancelModal = document.getElementById('cancelModal');
    completeModal = document.getElementById('completeModal');
    agentTypeBtns = document.querySelectorAll('.agent-type-btn');
    tokenInput = document.getElementById('tokenInput');
    fileSelectBtn = document.getElementById('fileSelectBtn');
    clearChatBtn = document.getElementById('clearChatBtn');

    marked.setOptions({
        breaks: true,
        gfm: true,
        highlight: function(code, lang) {
            // Add syntax highlighting classes and language indicator
            const language = lang || 'text';
            return `<pre class="code-block ${language}" data-lang="${language}"><code class="language-${language}">${code}</code></pre>`;
        }
    });

    agentSelect.value = selectedAgent;
}

async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="chat.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/chat/frontend/chat.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load Chat CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
    try {
        const response = await fetch('/view/applets/editer/components/chat/frontend/chat.html');
        const html = await response.text();
        const widgetsContainer = document.querySelector('.widgets-chat');
        widgetsContainer.innerHTML = html;
        
    } catch (error) {
        console.error('Failed to load chat template:', error);
    }
}

/**
 * Show placeholder when chat is not available
 */
function showPlaceholder() {
    if (!chatContainer) return;
    
    chatContainer.innerHTML = `
        <div class="chat-placeholder">
            <div class="placeholder-content">
                <h4>Chat Not Available</h4>
                <p>Chat functionality is not available at the moment</p>
            </div>
        </div>
    `;

    // Use editerState to collapse chat panel instead of direct window access
    if (editerState && editerState.trigger) {
        editerState.trigger('collapseChatPanel');
    }
}

/**
 * Get current selected agent
 */
function getSelectedAgent() {
    return selectedAgent;
}

/**
 * Set agent
 */
function setAgent(agent) {
    selectedAgent = agent;
    const agentSelect = document.getElementById('agentSelect');
    if (agentSelect) {
        agentSelect.value = agent;
    }
}

/**
 * Add View Project button to the last AI message
 */
function addProjectViewButton(projectName, files) {
    const chatWindow = document.getElementById('chatWindow');
    if (!chatWindow) return;

    // Find the last bot message
    const botMessages = chatWindow.querySelectorAll('.message.bot');
    const lastBotMessage = botMessages[botMessages.length - 1];
    
    if (!lastBotMessage) return;

    // Find main file for opening
    const mainFile = files.find(f => f.includes('main.') || f.includes('index.') || f.includes('app.')) || files[0];
    const editPath = `projects/${projectName}/${mainFile}`;

    // Create project view section to append to the AI message
    const projectViewSection = document.createElement('div');
    projectViewSection.className = 'project-view-section';
    projectViewSection.innerHTML = `
        <div class="project-divider"></div>
        <div class="project-view-container">
            <p class="project-ready-text">🎉 Project is ready! Files created:</p>
            <div class="project-files">
                ${files.map(file => `<span class="file-tag">${file}</span>`).join('')}
            </div>
            <button class="view-project-btn" data-file-path="${editPath}">
                📁 View Project
            </button>
        </div>
    `;
    
    // Add event listener instead of inline onclick
    const viewBtn = projectViewSection.querySelector('.view-project-btn');
    viewBtn.addEventListener('click', () => openProjectFile(editPath));
    
    // Append to the last bot message
    lastBotMessage.appendChild(projectViewSection);
    
    setTimeout(() => {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }, 50);
}

/**
 * Open project file in editor (without redirect)
 */
function openProjectFile(filePath) {
    try {
        // Get filename from path
        const fileName = filePath.split('/').pop();
        
        // Use editerState to communicate with MultiEditor instead of direct window access
        if (editerState && editerState.trigger) {
            editerState.trigger('openFile', { fileName, filePath });
            addMessage('📖 File opened in editor!', 'system');
        } else {
            // Fallback: direct URL change
            window.location.href = '/edit/' + filePath;
        }
    } catch (error) {
        console.error('Error opening project file:', error);
        // Fallback to URL change
        window.location.href = '/edit/' + filePath;
    }
}

async function initialize(_state) {
    state = _state;
    
    await injectCSS();
    await injectHTML();

    initializeChat();
    setupChatEvents();
    loadCustomAgents();
    console.log('Chat initialized');
}

export {
    initialize
}
