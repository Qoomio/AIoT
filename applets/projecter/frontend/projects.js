/**
 * Projecter Frontend JavaScript
 * Handles project creation, language selection, and project management
 */

import { inject as injectNavigater } from '/view/applets/navigater/frontend/navigater.js';

let selectedLanguage = null;

/**
 * Initialize the projecter interface
 */
function initializeProjecter() {
    setupLanguageSelection();
    setupProjectCreation();
    loadProjects();
}

/**
 * Setup language selection functionality
 */
function setupLanguageSelection() {
    document.querySelectorAll('.language-card').forEach(card => {
        card.addEventListener('click', () => {
            // Remove previous selection
            document.querySelectorAll('.language-card').forEach(c => c.classList.remove('selected'));
            
            // Select current card
            card.classList.add('selected');
            selectedLanguage = card.dataset.language;
            
            updateCreateButton();
        });
    });
}

/**
 * Setup project creation functionality
 */
function setupProjectCreation() {
    const projectNameInput = document.getElementById('projectName');
    const createBtn = document.getElementById('createBtn');

    // Project name validation
    projectNameInput.addEventListener('input', updateCreateButton);

    // Create project
    createBtn.addEventListener('click', createProject);
}

/**
 * Update create button state based on form validation
 */
function updateCreateButton() {
    const createBtn = document.getElementById('createBtn');
    const projectNameInput = document.getElementById('projectName');
    const projectName = projectNameInput.value.trim();
    const isValid = selectedLanguage && projectName && /^[a-zA-Z0-9_-]+$/.test(projectName);
    
    createBtn.disabled = !isValid;
}

/**
 * Create a new project
 */
async function createProject() {
    const projectNameInput = document.getElementById('projectName');
    const projectName = projectNameInput.value.trim();
    
    if (!selectedLanguage || !projectName) {
        showMessage('Please select a language and enter a project name', 'error');
        return;
    }

    const createBtn = document.getElementById('createBtn');
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';

    try {
        const response = await fetch('/projects/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: projectName,
                language: selectedLanguage
            })
        });

        const result = await response.json();

        if (result.success) {
            showMessage(`Project "${projectName}" created successfully!`, 'success');
            projectNameInput.value = '';
            selectedLanguage = null;
            document.querySelectorAll('.language-card').forEach(c => c.classList.remove('selected'));
            loadProjects(); // Refresh project list
        } else {
            showMessage(result.message || 'Failed to create project', 'error');
        }
    } catch (error) {
        showMessage('Error creating project: ' + error.message, 'error');
    } finally {
        createBtn.disabled = false;
        createBtn.textContent = 'Create Project';
        updateCreateButton();
    }
}

/**
 * Show message to user
 * @param {string} text - Message text
 * @param {string} type - Message type ('success' or 'error')
 */
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

/**
 * Load existing projects
 */
async function loadProjects() {
    try {
        const response = await fetch('/projects/all');
        const result = await response.json();

        const projectsList = document.getElementById('projectsList');
        
        if (result.success && result.data.length > 0) {
            projectsList.innerHTML = result.data.map(project => `
                <div class="project-item">
                    <div>
                        <h4>${project.name}</h4>
                        <div class="project-meta">
                            <div>Language: ${project.language}</div>
                            <div>Created: ${new Date(project.created).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div class="project-actions">
                        <button class="btn btn-small" onclick="openProject('${project.name}', '${project.language}')">Open</button>
                        <button class="btn btn-small btn-danger" onclick="deleteProject('${project.name}')">Delete</button>
                    </div>
                </div>
            `).join('');
        } else {
            projectsList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; grid-column: 1 / -1;">No projects found. Create your first project above!</p>';
        }
    } catch (error) {
        console.error('Error loading projects:', error);
        document.getElementById('projectsList').innerHTML = '<p style="color: var(--error); text-align: center; grid-column: 1 / -1;">Error loading projects</p>';
    }
}

/**
 * Open project in editor
 * @param {string} projectName - Name of the project
 * @param {string} language - Project language
 */
function openProject(projectName, language) {
    // Determine the main file based on project language
    let mainFile;
    switch (language) {
        case 'python':
            mainFile = 'main.py';
            break;
        case 'nodejs':
            mainFile = 'index.js';
            break;
        case 'web':
            mainFile = 'index.html';
            break;
        case 'c':
            mainFile = 'main.c';
            break;
        case 'curriculum':
            mainFile = 'template.md';
            break;
        case 'aiot':
            mainFile = 'main.py';
            break;
        default:
            // Fallback to README.md if language is unknown
            mainFile = 'README.md';
    }
    
    // Open the main file in the editor
    window.open(`/edit/projects/${projectName}/${mainFile}`, '_blank');
}

/**
 * Delete project
 * @param {string} projectName - Name of the project to delete
 */
async function deleteProject(projectName) {
    if (!confirm(`Are you sure you want to delete project "${projectName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`/projects/${projectName}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showMessage(`Project "${projectName}" deleted successfully`, 'success');
            loadProjects(); // Refresh project list
        } else {
            showMessage(result.message || 'Failed to delete project', 'error');
        }
    } catch (error) {
        showMessage('Error deleting project: ' + error.message, 'error');
    }
}

// Make functions globally accessible
window.openProject = openProject;
window.deleteProject = deleteProject;

initializeProjecter();
injectNavigater('projecter');