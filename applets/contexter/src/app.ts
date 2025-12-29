import 'dotenv/config';
import express from 'express';
import api from './api';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(api.prefix, api.routes);

// TODO: Clean
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

export default app;
export { api };