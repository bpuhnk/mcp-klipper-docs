/**
 * MCP Klipper Documentation Server - Error Handling
 * Custom error classes and error handling utilities
 */

import { ErrorType } from './types.js';
import { logger } from './logger.js';

export class KlipperError extends Error {
  public readonly type: ErrorType;
  public readonly context: string;
  public readonly timestamp: Date;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    type: ErrorType,
    context: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'KlipperError';
    this.type = type;
    this.context = context;
    this.timestamp = new Date();
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, KlipperError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      details: this.details,
      stack: this.stack
    };
  }
}

export class ValidationError extends KlipperError {
  constructor(message: string, context: string, details?: Record<string, unknown>) {
    super(message, ErrorType.VALIDATION, context, details);
    this.name = 'ValidationError';
  }
}

export class ParsingError extends KlipperError {
  constructor(message: string, context: string, details?: Record<string, unknown>) {
    super(message, ErrorType.PARSING, context, details);
    this.name = 'ParsingError';
  }
}

export class SearchError extends KlipperError {
  constructor(message: string, context: string, details?: Record<string, unknown>) {
    super(message, ErrorType.SEARCH, context, details);
    this.name = 'SearchError';
  }
}

export class GitError extends KlipperError {
  constructor(message: string, context: string, details?: Record<string, unknown>) {
    super(message, ErrorType.GIT, context, details);
    this.name = 'GitError';
  }
}

export class NotFoundError extends KlipperError {
  constructor(message: string, context: string, details?: Record<string, unknown>) {
    super(message, ErrorType.NOT_FOUND, context, details);
    this.name = 'NotFoundError';
  }
}

export function handleError(error: unknown, context: string): KlipperError {
  if (error instanceof KlipperError) {
    logger.error(error.message, error.context, { type: error.type, details: error.details });
    return error;
  }

  if (error instanceof Error) {
    logger.error(error.message, context, { stack: error.stack });
    return new KlipperError(error.message, ErrorType.SYSTEM, context, { originalError: error.name });
  }

  const message = String(error);
  logger.error(message, context);
  return new KlipperError(message, ErrorType.SYSTEM, context);
}

export function formatErrorResponse(error: KlipperError): { error: string; message: string; type: string } {
  return {
    error: error.context,
    message: error.message,
    type: error.type
  };
}
