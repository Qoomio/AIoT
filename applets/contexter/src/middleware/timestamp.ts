import { NextFunction, Response } from 'express';
import { ExtendedRequest } from '../types';

export const timestampMiddleware = (req: ExtendedRequest, res: Response, next: NextFunction): void => {
  req.timestamp = new Date().toISOString();
  next();
};
