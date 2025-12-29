import { 
  checkPreviewable,
} from './app.js';

/**
 * Check if a file is previewable
 */
function handlePreviewableCheck(req, res) {
  return checkPreviewable(req, res);
}

// Export API routes
const api = {
  routes: [
    {
      path: '/_api/preview/check/*',
      method: 'GET',
      handler: handlePreviewableCheck
    }
  ],
  prefix: '/editer/previewer'
};

export default api; 