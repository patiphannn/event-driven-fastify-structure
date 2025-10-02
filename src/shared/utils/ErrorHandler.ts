import { FastifyRequest, FastifyReply } from 'fastify';
import { Span, trace } from '@opentelemetry/api';
import pino from 'pino';
import { BaseError, isOperationalError, InternalServerError } from '../errors/ErrorTypes';

const logger = pino({ name: 'ErrorHandler' });

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    traceId?: string;
  };
  timestamp: string;
  path: string;
}

/**
 * Centralized error handler for consistent error processing
 * across all controllers and routes
 */
export class ErrorHandler {
  /**
   * Handle errors in controller methods
   * 
   * @param error - The error to handle
   * @param request - Fastify request object
   * @param reply - Fastify reply object
   * @param span - OpenTelemetry span for tracing
   * @returns Fastify reply with standardized error response
   */
  async handle(
    error: unknown,
    request: FastifyRequest,
    reply: FastifyReply,
    span?: Span
  ): Promise<FastifyReply> {
    const traceId = this.getTraceId(span);
    const processedError = this.processError(error);
    const errorResponse = this.buildErrorResponse(processedError, request, traceId);

    // Add error attributes to span
    if (span) {
      span.recordException(processedError);
      span.setAttributes({
        'error.type': processedError.errorCode,
        'error.message': processedError.message,
        'error.statusCode': processedError.statusCode.toString(),
        'error.operational': processedError.isOperational.toString(),
      });
    }

    // Log the error with appropriate level
    const logLevel = processedError.statusCode >= 500 ? 'error' : 'warn';
    logger[logLevel]({
      error: {
        name: processedError.name,
        message: processedError.message,
        code: processedError.errorCode,
        statusCode: processedError.statusCode,
        stack: processedError.stack,
        context: processedError.context,
      },
      request: {
        method: request.method,
        url: request.url,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        headers: this.sanitizeHeaders(request.headers),
      },
      traceId,
    }, `${processedError.statusCode} error in request processing`);

    return reply.status(processedError.statusCode).send(errorResponse);
  }

  /**
   * Process unknown errors and convert them to BaseError instances
   */
  private processError(error: unknown): BaseError {
    if (error instanceof BaseError) {
      return error;
    }

    // Handle common Node.js/JavaScript errors
    if (error instanceof Error) {
      // Convert common errors to appropriate BaseError types
      const errorMessage = error.message;
      
      // You can add more specific error mappings here
      if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
        const { ValidationError } = require('../errors/ErrorTypes');
        return new ValidationError(errorMessage, { originalError: error.name });
      }
      
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        const { NotFoundError } = require('../errors/ErrorTypes');
        return new NotFoundError(errorMessage, { originalError: error.name });
      }
      
      if (errorMessage.includes('unauthorized') || errorMessage.includes('authentication')) {
        const { UnauthorizedError } = require('../errors/ErrorTypes');
        return new UnauthorizedError(errorMessage, { originalError: error.name });
      }
      
      if (errorMessage.includes('forbidden') || errorMessage.includes('permission')) {
        const { ForbiddenError } = require('../errors/ErrorTypes');
        return new ForbiddenError(errorMessage, { originalError: error.name });
      }
      
      if (errorMessage.includes('conflict') || errorMessage.includes('duplicate')) {
        const { ConflictError } = require('../errors/ErrorTypes');
        return new ConflictError(errorMessage, { originalError: error.name });
      }
    }

    // Default to internal server error for unknown errors
    const message = process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred'
      : (error as Error)?.message || 'Unknown error';
    
    return new InternalServerError(message, {
      originalError: (error as Error)?.name || 'UnknownError',
      stack: (error as Error)?.stack,
    });
  }

  /**
   * Build standardized error response
   */
  private buildErrorResponse(error: BaseError, request: FastifyRequest, traceId?: string): ErrorResponse {
    // In production, don't expose sensitive error details for 5xx errors
    const isProduction = process.env.NODE_ENV === 'production';
    const shouldHideDetails = isProduction && error.statusCode >= 500;
    
    return {
      success: false,
      error: {
        code: error.errorCode,
        message: shouldHideDetails ? 'Internal server error' : error.message,
        details: shouldHideDetails ? undefined : error.context,
        traceId,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    };
  }

  /**
   * Get trace ID from span or generate one
   */
  private getTraceId(span?: Span): string {
    if (span) {
      return span.spanContext().traceId;
    }
    
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      return activeSpan.spanContext().traceId;
    }
    
    return 'unknown';
  }

  /**
   * Sanitize request headers to remove sensitive information
   */
  private sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    const sanitized = { ...headers };
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
}

/**
 * Setup global error handlers for unhandled errors
 */
export function setupGlobalErrorHandling(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.fatal({
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    }, 'Uncaught exception occurred');
    
    // Give time for logs to flush, then exit
    setTimeout(() => process.exit(1), 1000);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    logger.fatal({
      error: reason,
      promise: promise.toString(),
    }, 'Unhandled promise rejection occurred');
    
    // Give time for logs to flush, then exit
    setTimeout(() => process.exit(1), 1000);
  });
}