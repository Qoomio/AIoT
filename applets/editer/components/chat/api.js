/**
 * Chat Applet API
 * 
 * Provides chat functionality with OpenAI integration and fallback dummy mode
 * for testing when API quota is exceeded.
 */

import fs from 'fs';
import path from 'path';
import { processChatMessage, validateToken, createProjectFromAI } from './app.js';

const api = {
    // Metadata about this applet
    meta: {
      name: 'Chatbot',
      description: 'AI-powered chat assistant for developers',
      version: '1.0.0',
      author: 'System'
    },
  
    // Path prefix for all routes in this applet
    prefix: '/chat',

    routes: [
      {
        // Chat page - GET /chat/
        path: '/',
        method: 'GET',
        handler: (req, res) => {
          const htmlPath = path.join(__dirname, 'frontend', 'chat.html');
          fs.readFile(htmlPath, 'utf8', (err, data) => {
            if (err) {
              res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<h1>Error loading chat page</h1>');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
          });
        }
      },
      {
        // OpenAI Chat Message API - POST /chat/message
        path: '/message',
        method: 'POST',
        handler: async (req, res) => {
          try {
            const { message, agent, agentInfo, fileContext, isStarterMode } = req.body;
            
            // Process chat message with agent information, file context, and Starter Mode
            const result = await processChatMessage(message, agent, agentInfo, fileContext, isStarterMode);
            
            return res.status(200).json(result);
            
          } catch (error) {
            console.error('Chat API: Error processing message:', error.message);
            
            return res.status(500).json({
              success: false,
              error: error.message || 'An error occurred while processing the message.'
            });
          }
        }
      },
      {
        // Token test endpoint - POST /chat/test-token
        path: '/test-token',
        method: 'POST',
        handler: async (req, res) => {
          try {
            const { token, type } = req.body;
            
            if (!token || !type) {
              return res.status(400).json({
                valid: false,
                error: 'Token and type are required'
              });
            }

            // Test token validity
            const isValid = await testTokenValidity(token, type);
            
            return res.status(200).json({
              valid: isValid,
              message: isValid ? 'Token is valid' : 'Token is invalid'
            });
            
          } catch (error) {
            console.error('Token test error:', error.message);
            
            return res.status(500).json({
              valid: false,
              error: error.message || 'Token validation failed.'
            });
          }
        }
      },
      {
        // Project creation from AI - POST /chat/create-project
        path: '/create-project',
        method: 'POST',
        handler: async (req, res) => {
          try {
            const { projectName, language, codeBlocks } = req.body;
            
            // Process project creation with AI-generated code blocks
            const result = await createProjectFromAI(projectName, language, codeBlocks);
            
            return res.status(200).json(result);
            
          } catch (error) {
            console.error('Chat API: Error creating project from AI:', error.message);
            
            return res.status(500).json({
              success: false,
              error: error.message || 'An error occurred while creating the project.'
            });
          }
        }
      },
      {
        // Token validation endpoint - POST /chat/validate-token
        path: '/validate-token',
        method: 'POST',
        handler: async (req, res) => {
          try {
            const { agent, agentType, token, testMessage } = req.body;
            
            // Validate token using the same logic as chat
            const result = await validateToken(agent, agentType, token, testMessage);
            
            return res.status(200).json(result);
            
          } catch (error) {
            console.error('Token validation error:', error.message);
            
            return res.status(500).json({
              success: false,
              error: error.message || 'Token validation failed.'
            });
          }
        }
      }
    ]
  }; 

  /**
   * Test token validity for different AI services
   */
  async function testTokenValidity(token, type) {
    try {
      switch (type) {
        case 'qoom':
          return await testQoomLLMToken();
        case 'chatgpt':
          return await testOpenAIToken(token);
        case 'claude':
          return await testClaudeToken(token);
        case 'gemini':
          return await testGeminiToken(token);
        default:
          return false;
      }
    } catch (error) {
      console.error(`Token test error for ${type}:`, error);
      return false;
    }
  }

  /**
   * Test Qoom LLM (no token required)
   */
  async function testQoomLLMToken() {
    try {
      const response = await fetch('https://www.qoom.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mlx-community/Llama-3.2-1B-Instruct-4bit',
          messages: [
            { role: 'user', content: 'test' }
          ]
        })
      });
      
      // Qoom LLM doesn't require a token, so consider service working if 200 or 401
      return response.status === 200 || response.status === 401;
    } catch (error) {
      console.error('Qoom LLM test error:', error);
      return false;
    }
  }

  /**
   * Test OpenAI token
   */
  async function testOpenAIToken(token) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.status === 200;
    } catch (error) {
      console.error('OpenAI token test error:', error);
      return false;
    }
  }

  /**
   * Test Claude token
   */
  async function testClaudeToken(token) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': token,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }]
        })
      });
      
      // Claude returns 400 for invalid tokens, 200 for valid ones
      return response.status === 200 || response.status === 400;
    } catch (error) {
      console.error('Claude token test error:', error);
      return false;
    }
  }

  /**
   * Test Gemini token
   */
  async function testGeminiToken(token) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${token}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return response.status === 200;
    } catch (error) {
      console.error('Gemini token test error:', error);
      return false;
    }
  }

  export default api;