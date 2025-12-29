import { Request, Response, NextFunction } from 'express';
import { ValidationResult } from '../types';
import { createApiResponse } from '../utils/response';

export function createValidationMiddleware(validationFn: (req: Request) => ValidationResult) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validation = validationFn(req);
    
    if (!validation.isValid) {
      res.status(400).json(
        createApiResponse(
          false,
          undefined,
          undefined,
          validation.errors.join(', '),
          new Date().toISOString()
        )
      );
      return;
    }
    
    next();
  };
}
