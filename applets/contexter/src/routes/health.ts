import { Request, Response } from 'express';

export const healthStatusHandler = (req: Request, res: Response) => {
  const healthData = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  };

  res.json(healthData);
};

export const healthPingHandler = (req: Request, res: Response) => {
  res.json({ message: 'pong' });
};
