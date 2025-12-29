/**
 * Monaco Settings Applet API
 * 
 * This applet handles Monaco editor settings functionality.
 * Routes:
 * - GET /_api/monaco/settings - Get Monaco editor settings
 * - PUT /_api/monaco/settings - Update Monaco editor settings
 */

import { 
  getMonacoSettings, 
  updateMonacoSettings 
} from './app.js';

/**
 * Standard API Module Export Format
 */
const api = {
  // Metadata about this applet
  meta: {
    name: 'Monaco Settings',
    description: 'Monaco editor settings management',
    version: '1.0.0',
    author: 'System'
  },

  // Path prefix for all routes in this applet
  prefix: '/edit/_api/monaco',

  // Routes for Monaco settings
  routes: [
    {
      // Monaco settings API - GET
      path: '/settings',
      method: 'GET',
      handler: getMonacoSettings
    },
    {
      // Monaco settings API - PUT
      path: '/settings',
      method: 'PUT',
      handler: updateMonacoSettings
    }
  ]
};

export default api;
