import 'dotenv/config';
import api from './api';

// Initialize watcher when applet is loaded
import { initializeWatcher, shutdownWatcher } from './controllers/watcher';

initializeWatcher()

process.on('SIGINT', () => {
  console.log('[Contexter] Received SIGINT, shutting down gracefully...');
  shutdownWatcher();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Contexter] Received SIGTERM, shutting down gracefully...');
  shutdownWatcher();
  process.exit(0);
});

export { api };
export default api;