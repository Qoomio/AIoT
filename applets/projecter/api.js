/**
 * Projecter Applet API
 * 
 * This applet handles project creation for Python, Node.js, and C projects.
 * Routes:
 * - POST /create - Create new project with specified language
 * - GET /templates - List available project templates
 * - GET /projects - List existing projects
 * - DELETE /projects/:name - Delete existing project
 */

import { 
  createProject,
  getAvailableTemplates,
  listExistingProjects,
  deleteProject,
  validateProjectRequest,
  createResponse,
  logActivity,
  generateProjecterHTML
} from './app.js';

/**
 * Standard API Module Export Format
 */
const api = {
  // Metadata about this applet
  meta: {
    name: 'Project Creator',
    description: 'Creates Hello World projects in Python, Node.js, and C',
    version: '1.0.0',
    author: 'System'
  },

  // Path prefix for all routes in this applet
  prefix: '',

  // Routes for project management
  routes: [
    {
      // Create new project - POST /projects/create
      path: '/projects/create',
      method: 'POST',
      handler: async (req, res) => {
        try {
          logActivity('project_create_request', { body: req.body });
          
          // Validate request
          const validation = validateProjectRequest(req.body);
          if (!validation.isValid) {
            logActivity('project_validation_failed', { errors: validation.errors });
            return res.status(400).json(createResponse(false, null, validation.errors.join(', ')));
          }
          
          const { name, language } = req.body;
          
          // Create the project
          const result = await createProject(name, language);
          if (result.success) {
            logActivity('project_created', { name, language, path: result.data.path });
            return res.status(201).json(createResponse(true, result.data, 'Project created successfully'));
          } else {
            logActivity('project_creation_failed', { name, language, error: result.error });
            return res.status(400).json(createResponse(false, null, result.error));
          }
          
        } catch (error) {
          logActivity('project_create_error', { error: error.message });
          console.error('Error creating project:', error);
          return res.status(500).json(createResponse(false, null, 'Internal server error'));
        }
      }
    },
    
    {
      // List available templates - GET /projects/templates
      path: '/projects/templates',
      method: 'GET',
      handler: async (req, res) => {
        try {
          logActivity('templates_request');
          
          const templates = getAvailableTemplates();
          return res.json(createResponse(true, templates, 'Templates retrieved successfully'));
          
        } catch (error) {
          logActivity('templates_error', { error: error.message });
          console.error('Error getting templates:', error);
          return res.status(500).json(createResponse(false, null, 'Internal server error'));
        }
      }
    },
    
    {
      // List existing projects - GET /projects/all
      path: '/projects/all',
      method: 'GET',
      handler: async (req, res) => {
        try {
          logActivity('projects_list_request');
          
          const projects = await listExistingProjects();
          return res.json(createResponse(true, projects, 'Projects retrieved successfully'));
          
        } catch (error) {
          logActivity('projects_list_error', { error: error.message });
          console.error('Error listing projects:', error);
          return res.status(500).json(createResponse(false, null, 'Internal server error'));
        }
      }
    },
    
    {
      // Delete project - DELETE /projects/:name
      path: '/projects/:name',
      method: 'DELETE',
      handler: async (req, res) => {
        try {
          const projectName = req.params.name;
          logActivity('project_delete_request', { name: projectName });
          
          if (!projectName || projectName.trim() === '') {
            return res.status(400).json(createResponse(false, null, 'Project name is required'));
          }
          
          const result = await deleteProject(projectName);
          if (result.success) {
            logActivity('project_deleted', { name: projectName });
            return res.json(createResponse(true, null, 'Project deleted successfully'));
          } else {
            logActivity('project_deletion_failed', { name: projectName, error: result.error });
            return res.status(400).json(createResponse(false, null, result.error));
          }
          
        } catch (error) {
          logActivity('project_delete_error', { error: error.message });
          console.error('Error deleting project:', error);
          return res.status(500).json(createResponse(false, null, 'Internal server error'));
        }
      }
    },
    
    {
      // Serve frontend interface - GET /projects
      path: '/projects',
      method: 'GET',
      handler: async (req, res) => {
        try {
          logActivity('frontend_request');
          
          const html = generateProjecterHTML();
          
          res.writeHead(200, {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache'
          });
          res.end(html);
          
        } catch (error) {
          logActivity('frontend_error', { error: error.message });
          console.error('Error serving frontend:', error);
          return res.status(500).json(createResponse(false, null, 'Internal server error'));
        }
      }
    }
  ]
};

export default api; 