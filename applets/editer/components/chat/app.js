import os from 'os'
/**
 * Chat Sub-Applet Helper Functions
 * 
 * This module provides helper functions for chat functionality with OpenAI integration
 * and fallback dummy mode for testing when API quota is exceeded.
 */

/**
 * Generate Starter Mode system prompt for project creation
 */
function generateStarterModePrompt(isProjectRequest) {
  if (!isProjectRequest) return '';
  
  return `

STARTER MODE PROJECT CREATION:
When users ask to create a project, provide complete working code files in markdown code blocks.
- Always include the main implementation file
- Include configuration files when appropriate (package.json, requirements.txt, etc.)
- Use proper language tags in code blocks (python, javascript, html, css, etc.)
- Make the code functional and ready to run
- Include helpful comments in the code
- Match the language/framework the user specifically requests
- If no specific language is mentioned, ask for clarification
- For web projects, include HTML, CSS, and JavaScript files
- For Python projects, include main.py and requirements.txt
- For Node.js projects, include package.json and index.js
- For React projects, include package.json and App.jsx
- For other languages, include appropriate main files and config

Example response formats for different languages:

For Python:
\`\`\`python
# main.py
print("Hello World!")
\`\`\`

For JavaScript/Node.js:
\`\`\`javascript
// index.js
console.log("Hello World!");
\`\`\`

For React:
\`\`\`jsx
// App.jsx
function App() {
    return <h1>Hello World!</h1>;
}
export default App;
\`\`\`

For Java:
\`\`\`java
// Main.java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello World!");
    }
}
\`\`\`

IMPORTANT: Always match the user's requested language/framework exactly.`;
}

/**
 * Check if message is a project creation request
 */
function isProjectCreationRequest(message) {
  return /(?:create|make|build|generate|만들|생성|구현).*?(?:project|프로젝트)/i.test(message);
}

/**
 * Process chat message and return AI response
 * @param {string} message - User's message
 * @param {string} agent - Selected agent ID
 * @param {Object} agentInfo - Agent information { type, token }
 * @param {Object} fileContext - File context information { path, hasContext }
 * @param {boolean} isStarterMode - Whether Starter Mode is enabled
 * @returns {Promise<Object>} - Promise that resolves with response object
 */
async function processChatMessage(message, agent = 'qoom', agentInfo = null, fileContext = null, isStarterMode = false) {
  // Validate input message
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('Please provide a valid message.');
  }

  // Check for dummy mode
  const USE_DUMMY_MODE = process.env.USE_DUMMY_MODE === 'true';
  
  if (USE_DUMMY_MODE) {
    console.log(`Chat API: Using dummy mode for ${agent}`);
    return {
      success: true,
      message: `[${agent.toUpperCase()}] Here's a response to "${message}" (dummy mode)`
    };
  }

  // Check if this is a project creation request for Starter Mode
  const isProjectRequest = isStarterMode && isProjectCreationRequest(message);

  try {
    const context = await getCodeContext(message)
    message = `#Code context:\n ${context} \n\n\n #User Query\n ${message}`
    console.log(`Code context: ${context}`)
  } catch(e) {
    // do nothing
    console.log(`Error getting context: ${e}`)
  }

  // Route to appropriate AI service based on agent
  if (agent === 'qoom') {
    return await callQoomLLM(message, fileContext, isProjectRequest);
  } else if (agentInfo && agentInfo.type && agentInfo.token) {
    // Handle custom agents
    switch (agentInfo.type) {
      case 'chatgpt':
        return await callOpenAIAPI(message, agentInfo.token, fileContext, isProjectRequest);
      case 'claude':
        return await callClaudeAPI(message, agentInfo.token, fileContext, isProjectRequest);
      case 'gemini':
        return await callGeminiAPI(message, agentInfo.token, fileContext, isProjectRequest);
      default:
        throw new Error(`Unsupported agent type: ${agentInfo.type}`);
    }
  } else {
    throw new Error(`Invalid agent configuration: ${agent}`);
  }
}

async function getCodeContext(query) {
  const response = await fetch('http://localhost:3001/database/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      collectionName: os.userInfo().username,
      query: query
    })
  })

  const data = await response.json()

  return JSON.stringify(data)
}

async function callQoomLLM(message, fileContext = null, isProjectRequest = false) {
  console.log('Chat API: Calling Qoom LLM API');
  console.log('File context:', fileContext);
  
  try {
    // Prepare system prompt with file context awareness and Starter Mode support
    let systemPrompt = `You are a concise and practical development assistant for the Qoom environment. 

    Guidelines:
    1. Be direct and to the point. Avoid unnecessary explanations.
    2. When a file is provided in the context, focus on that specific file and give actionable advice.
    3. Format code in proper Markdown blocks with language tags.
    4. If the user asks about a specific file, assume they want changes to that file.
    5. Don't explain how to open files or use IDEs unless specifically asked.
    6. Keep responses focused and practical.
    7. When suggesting code changes, show the exact lines to change.`;
    
    // Add Starter Mode prompt if this is a project request
    if (isProjectRequest) {
      systemPrompt += generateStarterModePrompt(true);
    }

    // Add file context if provided
    if (fileContext && fileContext.hasContext) {
      systemPrompt += `\n\nFile Context:\nFile: ${fileContext.path}\nContent:\n\`\`\`\n${fileContext.content}\n\`\`\``;
    }

    const response = await fetch('https://www.qoom.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mlx-community/Llama-3.2-1B-Instruct-4bit',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Qoom LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      message: data.choices[0].message.content
    };
  } catch (error) {
    console.error('Qoom LLM API error:', error);
    throw new Error(`Qoom LLM API: ${error.message}`);
  }
}

async function callClaudeAPI(message, token, fileContext = null, isProjectRequest = false) {
  if (!token) {
    throw new Error('Claude API token is required');
  }

  console.log('Chat API: Calling Claude API');
  
  // Prepare system prompt
  let systemPrompt = `You are a highly skilled software development assistant integrated into the Qoom development environment.
Your role is to assist developers with coding, debugging, optimization, and project management tasks inside Qoom.

Guidelines:
1. Always format code inside proper Markdown code blocks with the correct language tag.
2. When explaining code, include concise inline comments and step-by-step reasoning when helpful.
3. If a developer's request is ambiguous, ask clarifying questions before giving the answer.
4. Provide examples that can be run directly in the Qoom environment whenever possible.
5. Prioritize correctness, performance, and security in your suggestions.
6. If the question is about debugging, suggest potential causes, then propose step-by-step fixes.
7. Use a professional but friendly tone. Avoid unnecessary small talk.`;

  // Add Starter Mode prompt if this is a project request
  if (isProjectRequest) {
    systemPrompt += generateStarterModePrompt(true);
  }
  
  // Prepare message with file context
  let messageWithContext = message;
  if (fileContext && fileContext.hasContext) {
    messageWithContext = `File Context:
File: ${fileContext.path}
Content:
\`\`\`
${fileContext.content}
\`\`\`

Question: ${message}`;
  }
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': token,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: messageWithContext }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return {
    success: true,
    message: data.content[0].text
  };
}

async function callOpenAIAPI(message, token, fileContext = null, isProjectRequest = false) {
  if (!token) {
    throw new Error('OpenAI API key is required');
  }

  console.log('Chat API: Calling OpenAI API');
  
  // Prepare system prompt with file context
  let systemPrompt = `You are a highly skilled software development assistant integrated into the Qoom development environment.  
Your role is to assist developers with coding, debugging, optimization, and project management tasks inside Qoom.  

Guidelines:  
1. Always format code inside proper Markdown code blocks with the correct language tag (e.g., \`\`\`javascript, \`\`\`python).  
2. When explaining code, include concise inline comments and step-by-step reasoning when helpful.  
3. If a developer's request is ambiguous, ask clarifying questions before giving the answer.  
4. Provide examples that can be run directly in the Qoom environment whenever possible.  
5. Prioritize correctness, performance, and security in your suggestions.  
6. If the question is about debugging, suggest potential causes, then propose step-by-step fixes.  
7. Use a professional but friendly tone. Avoid unnecessary small talk.  
8. When referencing file paths or commands, match Qoom's project structure and conventions.  

Your main goal:  
- Accelerate the developer's workflow in Qoom.  
- Help integrate features smoothly into existing Qoom projects.  
- Provide practical, runnable solutions, not just theoretical explanations.`;

  // Add Starter Mode prompt if this is a project request
  if (isProjectRequest) {
    systemPrompt += generateStarterModePrompt(true);
  }

  // Add file context if provided
  if (fileContext && fileContext.hasContext) {
    systemPrompt += `\n\nFile Context:\nFile: ${fileContext.path}\nContent:\n\`\`\`\n${fileContext.content}\n\`\`\``;
  }
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: systemPrompt
        },
        { role: 'user', content: message }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return {
    success: true,
    message: data.choices[0].message.content
  };
}

async function callGeminiAPI(message, token, fileContext = null, isProjectRequest = false) {
  if (!token) {
    throw new Error('Gemini API key is required');
  }

  console.log('Chat API: Calling Gemini API');
  
  // Prepare system prompt
  let systemContent = `You are a highly skilled software development assistant integrated into the Qoom development environment.
Your role is to assist developers with coding, debugging, optimization, and project management tasks inside Qoom.

Guidelines:
1. Always format code inside proper Markdown code blocks with the correct language tag.
2. When explaining code, include concise inline comments and step-by-step reasoning when helpful.
3. If a developer's request is ambiguous, ask clarifying questions before giving the answer.
4. Provide examples that can be run directly in the Qoom environment whenever possible.
5. Prioritize correctness, performance, and security in your suggestions.
6. If the question is about debugging, suggest potential causes, then propose step-by-step fixes.
7. Use a professional but friendly tone. Avoid unnecessary small talk.`;

  // Add Starter Mode prompt if this is a project request
  if (isProjectRequest) {
    systemContent += generateStarterModePrompt(true);
  }
  
  // Prepare message with file context
  let messageWithContext = message;
  if (fileContext && fileContext.hasContext) {
    messageWithContext = `File Context:
File: ${fileContext.path}
Content:
\`\`\`
${fileContext.content}
\`\`\`

Question: ${message}`;
  }

  // Combine system prompt with user message for Gemini
  const fullMessage = `${systemContent}\n\nUser: ${messageWithContext}`;
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${token}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: fullMessage }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return {
    success: true,
    message: data.candidates[0].content.parts[0].text
  };
}

/**
 * Validate token with API
 */
async function validateToken(agent, type, token) {
    console.log(`Validating token for ${agent} (${type})`);
    
    try {
        const response = await fetch('/chat/validate-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                agent: agent,
                agentType: type,
                token: token,
                testMessage: "Hello, this is a test message to validate the API token."
            })
        });

        const data = await response.json();
        
        if (data.success) {
            console.log(`Token validation successful for ${agent}`);
            return true;
        } else {
            console.error(`Token validation failed for ${agent}:`, data.error);
            return false;
        }
    } catch (error) {
        console.error('Token validation request failed:', error);
        throw new Error('Network error during token validation');
    }
}

async function validateClaudeToken(token, testMessage) {
  // Temporarily disable Claude validation
  console.log('Claude token validation temporarily disabled');
  return { success: true };
}

async function validateOpenAIToken(token, testMessage) {
  // Remove OpenAI API token format validation and only validate with actual API call
  console.log('Validating OpenAI token...');
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      max_tokens: 10, // Minimal tokens for validation
      messages: [
        { role: 'user', content: testMessage }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('OpenAI validation error:', errorData);
    throw new Error(`OpenAI API: ${response.status} ${response.statusText} - ${errorData.error?.message || ''}`);
  }

  return { success: true };
}

async function validateGeminiToken(token, testMessage) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${token}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: testMessage }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 10 // Minimal tokens for validation
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API: ${response.status} ${response.statusText} - ${errorData.error?.message || ''}`);
  }

  return { success: true };
}

/**
 * Create project from AI-generated code blocks
 * @param {string} projectName - Name of the project
 * @param {string} language - Programming language
 * @param {Array} codeBlocks - Array of code blocks with filename, language, and code
 * @returns {Promise<Object>} - Project creation result
 */
async function createProjectFromAI(projectName, language, codeBlocks) {
  const fs = await import('fs');
  const path = await import('path');
  const fsPromises = fs.promises;
  
  try {
    // Define projects directory
    const projectsRoot = path.join(process.cwd(), 'projects');
    const projectPath = path.join(projectsRoot, projectName);
    
    console.log(`Creating AI project: ${projectName} (${language})`);
    console.log(`Project path: ${projectPath}`);
    console.log(`Code blocks: ${codeBlocks.length}`);
    
    // Ensure projects directory exists
    try {
      await fsPromises.access(projectsRoot);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fsPromises.mkdir(projectsRoot, { recursive: true });
        console.log('Created projects directory');
      } else {
        throw error;
      }
    }
    
    // Check if project already exists
    try {
      await fsPromises.access(projectPath);
      return {
        success: false,
        error: `Project '${projectName}' already exists`
      };
    } catch (error) {
      // Project doesn't exist, we can proceed
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    // Create project directory
    await fsPromises.mkdir(projectPath, { recursive: true });
    console.log(`Created project directory: ${projectPath}`);
    
    // Write all code blocks as files
    const createdFiles = [];
    for (const block of codeBlocks) {
      const filePath = path.join(projectPath, block.filename);
      await fsPromises.writeFile(filePath, block.code, 'utf8');
      createdFiles.push(block.filename);
      console.log(`Created file: ${block.filename}`);
    }
    
    // If no main files exist, create a basic README
    const hasReadme = createdFiles.some(f => f.toLowerCase().includes('readme'));
    if (!hasReadme) {
      const readmeContent = `# ${projectName}

This project was created by AI in Qoom Starter Mode.

## Files
${createdFiles.map(f => `- ${f}`).join('\n')}

## Getting Started
Please refer to the individual files for implementation details.
`;
      const readmePath = path.join(projectPath, 'README.md');
      await fsPromises.writeFile(readmePath, readmeContent, 'utf8');
      createdFiles.push('README.md');
      console.log('Created README.md');
    }
    
    return {
      success: true,
      data: {
        name: projectName,
        language: language,
        path: projectPath,
        files: createdFiles
      },
      files: createdFiles
    };
    
  } catch (error) {
    console.error('Error creating project from AI:', error);
    return {
      success: false,
      error: `Failed to create project: ${error.message}`
    };
  }
}

export {
  processChatMessage,
  validateToken,
  createProjectFromAI
};
