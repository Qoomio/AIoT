import express from 'express';
import { createDatabaseHandler, queryDatabaseHandler, updateDatabaseHandler } from '../controllers/database';

const router = express.Router();

router.post('/create', createDatabaseHandler);
router.post('/query', queryDatabaseHandler);
router.patch('/update', updateDatabaseHandler);
// insert
// insertBatch

export default router;