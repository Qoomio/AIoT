import { Request } from 'express';

export interface ExtendedRequest extends Request {
  timestamp?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}