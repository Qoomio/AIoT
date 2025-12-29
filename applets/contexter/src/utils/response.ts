import { Response } from 'express';
import { ApiResponse } from '../types';

export function createApiResponse<T>(
  success: boolean,
  data?: T,
  message?: string,
  error?: string,
  timestamp?: string
): ApiResponse<T> {
  return {
    success,
    ...(data && { data }),
    ...(message && { message }),
    ...(error && { error }),
    timestamp: timestamp || new Date().toISOString()
  };
}

export function handleApiError(
  res: Response,
  error: unknown,
  timestamp: string,
  statusCode: number = 500
): void {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  res.status(statusCode).json(
    createApiResponse(false, undefined, undefined, errorMessage, timestamp)
  );
}

export function validateRequiredParams(
  params: Record<string, any>,
  requiredParams: string[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const param of requiredParams) {
    if (!params[param]) {
      errors.push(`Missing required parameter: ${param}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
