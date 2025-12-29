import express from 'express';
import databaseRouter from './database';
import healthRouter from './health';

const router = express.Router();

router.use('/database', databaseRouter);
router.use('/health', healthRouter);

export default router;