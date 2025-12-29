import routes from './routes';
import { 
  timestampMiddleware,
  loggingMiddleware,
  rateLimitMiddleware,
  authMiddleware
} from './middleware';

const api = {
  meta: {
    name: 'Contexter Applet',
    description: 'Context-aware database operations and querying with prompts and file paths',
    version: '1.0.0',
    author: 'System',
    endpoints: routes.length
  },

  prefix: '/',

  middleware: [
    timestampMiddleware,
    loggingMiddleware,
    rateLimitMiddleware,
    authMiddleware
  ],

  routes
};

export default api;
