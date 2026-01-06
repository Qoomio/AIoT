import type { Request, Response, NextFunction } from 'express';
import {
  healthStatusHandler,
  healthPingHandler,
  createDatabaseHandler,
  queryDatabaseHandler,
  updateDatabaseHandler
} from './routes';
import {
  timestampMiddleware,
  loggingMiddleware,
  rateLimitMiddleware,
  authMiddleware
} from './middleware';

// Initialize watcher service
import './app';

/**
 * Standard qoom2 route definition
 */
interface RouteDefinition {
  path: string;
  method: string;
  handler: (req: Request, res: Response) => void | Promise<void>;
  middleware?: Array<(req: Request, res: Response, next: NextFunction) => void>;
}

const api = {
  meta: {
    name: 'Contexter Applet',
    description: 'Context-aware database operations and querying with prompts and file paths',
    version: '1.0.0',
    author: 'System'
  },

  prefix: '/database',

  middleware: [
    timestampMiddleware,
    loggingMiddleware,
    rateLimitMiddleware,
    authMiddleware
  ],

  routes: [
    // Health check routes
    {
      path: '/health/status',
      method: 'GET',
      handler: healthStatusHandler
    },
    {
      path: '/health/ping',
      method: 'GET',
      handler: healthPingHandler
    },
    // Database routes
    {
      path: '/create',
      method: 'POST',
      handler: createDatabaseHandler
    },
    {
      path: '/query',
      method: 'POST',
      handler: queryDatabaseHandler
    },
    {
      path: '/update',
      method: 'PATCH',
      handler: updateDatabaseHandler
    }
  ] as RouteDefinition[]
};

export default api;
