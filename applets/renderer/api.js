/**
 * Renderer Applet API
 * 
 * This applet handles file rendering with specialized viewers for different file types.
 * 
 * Routes:
 * - GET /render/* - Render files with appropriate viewers
 */

import { handleRenderRoute } from './app.js';

/**
 * Main render route handler
 * Delegates to handleRenderRoute from app.js
 */
function handleMainRenderRoute(req, res) {
  return handleRenderRoute(req, res);
}



/**
 * Standard API Module Export Format
 */
const api = {
  meta: {
    name: 'Renderer',
    description: 'File rendering with specialized viewers for different file types',
    version: '1.0.0',
    author: 'Qoom Team'
  },

  prefix: '',

  routes: [
    {
      path: '/render/*',
      method: 'GET',
      handler: handleMainRenderRoute
    }
  ]
};

export default api; 