/**
 * Abouter Applet API
 * 
 * Provides system information about the running server.
 */

import { getSystemInfo } from './app.js';

const api = {
  meta: {
    name: 'Abouter Applet',
    description: 'Provides system and application information',
    version: '1.0.0',
    author: 'System'
  },

  // Mount at root level so the endpoint is /about
  prefix: '',

  routes: [
    {
      path: '/about',
      method: 'GET',
      middleware: [
        // Enable CORS for cross-origin requests from dashboard
        (req, res, next) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          next();
        }
      ],
      handler: (req, res) => {
        const info = getSystemInfo();
        res.json(info);
      }
    },
    {
      // Handle CORS preflight requests
      path: '/about',
      method: 'OPTIONS',
      handler: (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).end();
      }
    }
  ]
};

export default api;
