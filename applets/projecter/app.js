/**
 * Projecter Applet Core Functions
 * 
 * This module contains the core logic for creating and managing projects
 * in Python, Node.js, and C programming languages.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use fs.promises for async file operations
const fsPromises = fs.promises;

// Define the projects root directory
const PROJECTS_ROOT = path.join(process.cwd(), 'projects');

// Define the templates root directory
const TEMPLATES_ROOT = path.join(__dirname, 'templates');

/**
 * Template metadata for different languages
 */
const TEMPLATE_METADATA = {
  python: {
    name: 'Python',
    description: 'Python Hello World project with main.py and requirements.txt'
  },
  nodejs: {
    name: 'Node.js',
    description: 'Node.js Hello World project with package.json and index.js'
  },
  web: {
    name: 'Web Project',
    description: 'Full-stack web project with HTML, CSS, JS frontend and Node.js backend server'
  },
  c: {
    name: 'C',
    description: 'C Hello World project with main.c and Makefile'
  },
  curriculum: {
    name: 'Curriculum',
    description: 'Educational curriculum template with lessons, challenges, and homework structure'
  },
  aiot: {
    name: 'AIoT',
    description: 'AIoT project with Python, camera integration, and AI capabilities'
  }
};

/**
 * Get available template languages
 */
function getAvailableTemplateLanguages() {
  return Object.keys(TEMPLATE_METADATA);
}

/**
 * Check if template exists for given language
 */
async function templateExists(language) {
  try {
    const templateDir = path.join(TEMPLATES_ROOT, language);
    await fsPromises.access(templateDir);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get template files for a specific language
 */
async function getTemplateFiles(language) {
  try {
    const templateDir = path.join(TEMPLATES_ROOT, language);
    
    // Check if template directory exists
    await fsPromises.access(templateDir);
    
    // Read all files in template directory
    const files = await fsPromises.readdir(templateDir);
    const templateFiles = {};
    
    // Read content of each file
    for (const fileName of files) {
      const filePath = path.join(templateDir, fileName);
      const stats = await fsPromises.stat(filePath);
      
      // Only read regular files, skip directories
      if (stats.isFile()) {
        const content = await fsPromises.readFile(filePath, 'utf8');
        templateFiles[fileName] = content;
      }
    }
    
    return templateFiles;
  } catch (error) {
    throw new Error(`Failed to read template files for ${language}: ${error.message}`);
  }
}

/**
 * Get template metadata and files for a specific language
 */
async function getTemplate(language) {
  const normalizedLanguage = language.toLowerCase();
  
  if (!TEMPLATE_METADATA[normalizedLanguage]) {
    throw new Error(`Template for language '${language}' not found`);
  }
  
  const files = await getTemplateFiles(normalizedLanguage);
  
  return {
    name: TEMPLATE_METADATA[normalizedLanguage].name,
    description: TEMPLATE_METADATA[normalizedLanguage].description,
    files
  };
}

function generateProjecterHTML() {
    const fullPath = path.join(__dirname, 'frontend', 'projects.html');
    const html = fs.readFileSync(fullPath, 'utf8');
    return html;
}

/**
 * Legacy function name for backward compatibility
 */
function getProjecterHTML() {
    return generateProjecterHTML();
}

/**
 * Ensure the projects directory exists
 */
async function ensureProjectsDirectory() {
  try {
    await fsPromises.access(PROJECTS_ROOT);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fsPromises.mkdir(PROJECTS_ROOT, { recursive: true });
      logActivity('projects_directory_created', { path: PROJECTS_ROOT });
    } else {
      throw error;
    }
  }
}

/**
 * Validate project creation request
 */
function validateProjectRequest(body) {
  const errors = [];
  
  if (!body) {
    errors.push('Request body is required');
    return { isValid: false, errors };
  }
  
  const { name, language } = body;
  
  // Validate project name
  if (!name || typeof name !== 'string') {
    errors.push('Project name is required and must be a string');
  } else {
    // Check for valid project name format
    const nameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!nameRegex.test(name)) {
      errors.push('Project name can only contain letters, numbers, underscores, and hyphens');
    }
    
    if (name.length < 1 || name.length > 50) {
      errors.push('Project name must be between 1 and 50 characters');
    }
  }
  
  // Validate language
  if (!language || typeof language !== 'string') {
    errors.push('Language is required and must be a string');
  } else {
    const validLanguages = getAvailableTemplateLanguages();
    if (!validLanguages.includes(language.toLowerCase())) {
      errors.push(`Language must be one of: ${validLanguages.join(', ')}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Create a new project
 */
async function createProject(name, language) {
  try {
    // Ensure projects directory exists
    await ensureProjectsDirectory();
    
    // Normalize language
    const normalizedLanguage = language.toLowerCase();
    
    // Check if template exists
    if (!(await templateExists(normalizedLanguage))) {
      return {
        success: false,
        error: `Template for language '${language}' not found`
      };
    }
    
    // Create project directory path
    const projectPath = path.join(PROJECTS_ROOT, name);
    
    // Check if project already exists
    try {
      await fsPromises.access(projectPath);
      return {
        success: false,
        error: `Project '${name}' already exists`
      };
    } catch (error) {
      // Project doesn't exist, we can proceed
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    // Create project directory
    await fsPromises.mkdir(projectPath, { recursive: true });
    
    // Get template
    const template = await getTemplate(normalizedLanguage);
    
    // Create all template files
    for (const [fileName, content] of Object.entries(template.files)) {
      const filePath = path.join(projectPath, fileName);
      
      // Replace project name placeholder in package.json
      let fileContent = content;
      if (fileName === 'package.json') {
        if (normalizedLanguage === 'nodejs') {
          fileContent = content.replace('"hello-world-nodejs"', `"${name}"`);
        } else if (normalizedLanguage === 'web') {
          fileContent = content.replace('"hello-world-web"', `"${name}"`);
        }
      }
      
      await fsPromises.writeFile(filePath, fileContent, 'utf8');
    }
    
    // For Python projects (python, aiot), initialize uv virtual environment and sync dependencies
    if (normalizedLanguage === 'python' || normalizedLanguage === 'aiot') {
      try {
        logActivity('uv_setup', 'initializing_venv', { project: name, language: normalizedLanguage });
        
        // For AIoT projects, install system packages (libcamera) before setting up venv
        if (normalizedLanguage === 'aiot') {
          try {
            logActivity('aiot_setup', 'installing_system_packages', { project: name });
            
            // Check if we're on a Linux system (Raspberry Pi)
            const isLinux = process.platform === 'linux';
            
            if (isLinux) {
              // Update package list
              try {
                execSync('sudo apt update', {
                  stdio: 'pipe',
                  timeout: 60000 // 60 seconds timeout
                });
                console.log(`[Projecter] Updated apt package list for ${name}`);
              } catch (error) {
                console.warn(`[Projecter] Failed to update apt (may need sudo):`, error.message);
              }
              
              // Install picamera2 and all required dependencies
              // python3-picamera2 includes libcamera, kms, pykms, and all dependencies
              // python3-libcamera provides the libcamera Python module
              // libcamera-dev provides development headers
              try {
                execSync('sudo apt install -y python3-picamera2 python3-libcamera libcamera-dev', {
                  stdio: 'pipe',
                  timeout: 120000 // 2 minutes timeout
                });
                logActivity('aiot_setup', 'system_packages_installed', { project: name });
                console.log(`[Projecter] Installed picamera2 system packages for ${name}`);
              } catch (error) {
                console.warn(`[Projecter] Failed to install picamera2 packages (may need sudo):`, error.message);
                logActivity('aiot_setup', 'system_packages_install_failed', { 
                  project: name, 
                  error: error.message 
                });
                // Continue anyway - user can install manually
              }
            } else {
              console.warn(`[Projecter] AIoT projects require Linux (Raspberry Pi). Skipping system package installation.`);
              logActivity('aiot_setup', 'not_linux', { project: name, platform: process.platform });
            }
          } catch (error) {
            // Non-critical error, log but continue
            console.warn(`[Projecter] Error during AIoT system package setup for ${name}:`, error.message);
            logActivity('aiot_setup', 'setup_error', { project: name, error: error.message });
          }
        }
        
        // Check if uv is available
        let uvAvailable = false;
        try {
          execSync('which uv', { stdio: 'ignore' });
          uvAvailable = true;
        } catch (error) {
          // uv not found, skip venv creation but log a warning
          console.warn(`[Projecter] uv not found in PATH, skipping uv setup for ${name}`);
          logActivity('uv_setup', 'uv_not_found', { project: name });
          // Continue without venv - user can create it manually later
        }
        
        if (uvAvailable) {
          // Step 1: Create uv virtual environment
          try {
            // For AIoT projects, use --system-site-packages to access system-installed libcamera
            const venvArgs = normalizedLanguage === 'aiot' 
              ? 'uv venv --system-site-packages'
              : 'uv venv';
            
            execSync(venvArgs, {
              cwd: projectPath,
              stdio: 'pipe',
              env: { ...process.env }
            });
            logActivity('uv_setup', 'venv_created', { project: name });
            console.log(`[Projecter] Created uv virtual environment for ${name}`);
            
            // Step 2: Sync dependencies (installs packages from pyproject.toml)
            // This is equivalent to: uv sync (which installs dependencies into .venv)
            try {
              execSync('uv sync', {
                cwd: projectPath,
                stdio: 'pipe',
                env: { ...process.env }
              });
              logActivity('uv_setup', 'dependencies_synced', { project: name });
              console.log(`[Projecter] Synced dependencies for ${name}`);
            } catch (error) {
              // If sync fails, log but don't fail the project creation
              console.warn(`[Projecter] Failed to sync dependencies for ${name}:`, error.message);
              logActivity('uv_setup', 'sync_failed', { project: name, error: error.message });
            }
          } catch (error) {
            // If venv creation fails, log but don't fail the project creation
            console.warn(`[Projecter] Failed to create uv venv for ${name}:`, error.message);
            logActivity('uv_setup', 'venv_creation_failed', { project: name, error: error.message });
          }
        }
      } catch (error) {
        // Non-critical error, log but continue
        console.warn(`[Projecter] Error during uv setup for ${name}:`, error.message);
        logActivity('uv_setup', 'setup_error', { project: name, error: error.message });
      }
    }
    
    return {
      success: true,
      data: {
        name,
        language: normalizedLanguage,
        path: projectPath,
        template: template.name,
        files: Object.keys(template.files)
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Failed to create project: ${error.message}`
    };
  }
}

/**
 * Get available project templates
 */
async function getAvailableTemplates() {
  const languages = getAvailableTemplateLanguages();
  const templates = [];
  
  for (const language of languages) {
    try {
      const templateFiles = await getTemplateFiles(language);
      const metadata = TEMPLATE_METADATA[language];
      
      templates.push({
        id: language,
        name: metadata.name,
        description: metadata.description,
        files: Object.keys(templateFiles)
      });
    } catch (error) {
      console.warn(`Warning: Could not load template for ${language}: ${error.message}`);
    }
  }
  
  return templates;
}

/**
 * List existing projects
 */
async function listExistingProjects() {
  try {
    await ensureProjectsDirectory();
    
    const items = await fsPromises.readdir(PROJECTS_ROOT, { withFileTypes: true });
    const projects = [];
    
    for (const item of items) {
      if (item.isDirectory()) {
        const projectPath = path.join(PROJECTS_ROOT, item.name);
        const stats = await fsPromises.stat(projectPath);
        
        // Try to detect project type by looking at files
        let detectedLanguage = 'unknown';
        try {
          const files = await fsPromises.readdir(projectPath);
          if (files.includes('server.js') && files.includes('index.html')) {
            detectedLanguage = 'web';
          } else if (files.includes('package.json')) {
            detectedLanguage = 'nodejs';
          } else if (files.includes('main.py')) {
            detectedLanguage = 'python';
          } else if (files.includes('main.c') || files.includes('Makefile')) {
            detectedLanguage = 'c';
          }
        } catch (error) {
          // Ignore errors reading project directory
        }
        
        projects.push({
          name: item.name,
          path: projectPath,
          language: detectedLanguage,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }
    }
    
    return projects.sort((a, b) => b.created - a.created);
    
  } catch (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
}

/**
 * Delete a project
 */
async function deleteProject(name) {
  try {
    const projectPath = path.join(PROJECTS_ROOT, name);
    
    // Check if project exists
    try {
      await fsPromises.access(projectPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          success: false,
          error: `Project '${name}' does not exist`
        };
      }
      throw error;
    }
    
    // Remove project directory and all contents
    await fsPromises.rm(projectPath, { recursive: true, force: true });
    
    return {
      success: true,
      data: { name, path: projectPath }
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete project: ${error.message}`
    };
  }
}

/**
 * Create standardized response object
 */
function createResponse(success, data = null, message = '') {
  return {
    success,
    data,
    message,
    timestamp: new Date().toISOString()
  };
}

/**
 * Log activity for monitoring and debugging
 */
function logActivity(action, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Projecter: ${action}`, details);
}

// Export all functions
export {
  createProject,
  getAvailableTemplates,
  listExistingProjects,
  deleteProject,
  validateProjectRequest,
  createResponse,
  logActivity,
  ensureProjectsDirectory,
  generateProjecterHTML,
  getAvailableTemplateLanguages,
  templateExists,
  getTemplateFiles,
  getTemplate,
  TEMPLATE_METADATA,
  PROJECTS_ROOT,
  TEMPLATES_ROOT
}; 