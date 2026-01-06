// Export all route handlers for use in api.ts
export { healthStatusHandler, healthPingHandler } from './health';
export { createDatabaseHandler, queryDatabaseHandler, updateDatabaseHandler } from '../controllers/database';