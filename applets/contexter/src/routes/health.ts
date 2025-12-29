import express from 'express';

const router = express.Router();

router.get('/status', (req, res) => {
  const healthData = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  };
  
  res.json(healthData);
});

router.get('/ping', (req, res) => {
  res.json({ message: 'pong' });
});

export default router;
