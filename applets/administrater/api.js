/**
 * Administrater Applet API
 * 
 * This applet provides an administrative dashboard accessible via /admin
 * that displays cards for all applets that have admin.json configuration files.
 */

import { scanAppletsForAdmin, getAppletAdminConfig, getSystemInfo, generateAdminHTML } from './app.js';

/**
 * Standard API Module Export Format
 */
const api = {
  // Metadata about this applet
  meta: {
    name: 'Administrative Dashboard',
    description: 'Admin dashboard showing all applets with admin configurations',
    version: '1.0.0',
    author: 'System'
  },

  // No prefix - we want to use the root /admin path
  prefix: '',

  // Routes for the admin dashboard
  routes: [
    {
      // Main admin dashboard page - GET /admin
      path: '/admin',
      method: 'GET',
      handler: async (req, res) => {
        try {
          // Generate HTML for the admin dashboard using frontend files
          const html = generateAdminHTML();
          
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          
        } catch (error) {
          console.error('Error loading admin dashboard:', error);
          
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <head><title>Admin Dashboard Error</title></head>
              <body>
                <h1>Error Loading Admin Dashboard</h1>
                <p>Error: ${error.message}</p>
              </body>
            </html>
          `);
        }
      }
    },
    {
      // API endpoint to get applet admin data - GET /admin/api/applets
      path: '/admin/api/applets',
      method: 'GET',
      handler: async (req, res) => {
        try {
          const adminConfigs = await scanAppletsForAdmin();
          const systemInfo = getSystemInfo();
          
          res.json({
            success: true,
            data: {
              applets: adminConfigs,
              system: systemInfo,
              timestamp: new Date().toISOString()
            }
          });
          
        } catch (error) {
          console.error('Error getting admin data:', error);
          
          res.status(500).json({
            success: false,
            error: error.message
          });
        }
      }
    },
    {
      // API endpoint to get specific applet admin data - GET /admin/api/applet/:name
      path: '/admin/api/applet/:name',
      method: 'GET',
      handler: async (req, res) => {
        try {
          const appletName = req.params.name;
          const adminConfig = await getAppletAdminConfig(appletName);
          
          if (!adminConfig) {
            return res.status(404).json({
              success: false,
              error: `No admin configuration found for applet: ${appletName}`
            });
          }
          
          res.json({
            success: true,
            data: adminConfig
          });
          
        } catch (error) {
          console.error('Error getting applet admin data:', error);
          
          res.status(500).json({
            success: false,
            error: error.message
          });
        }
      }
    }
  ]
};

export default api;