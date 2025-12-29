import { NextFunction, Response } from 'express';
import { ExtendedRequest } from '../types';

export const loggingMiddleware = (req: ExtendedRequest, res: Response, next: NextFunction): void => {
  console.log(`[${req.timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next();
};
