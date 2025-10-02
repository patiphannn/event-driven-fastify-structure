import { FastifyRequest, FastifyReply } from 'fastify';
import { trace } from '@opentelemetry/api';
import pino from 'pino';
import { BaseError } from '../../shared/errors/ErrorTypes';
import { ErrorHandler } from '../../shared/utils/ErrorHandler';
import { CONFIG } from '../../shared/config';

/**
 * Base middleware class that provides common functionality for all middleware
 * Following the coding standards for error handling, tracing, and logging
 */
export abstract class BaseMiddleware {
  protected readonly logger: pino.Logger;
  protected readonly errorHandler: ErrorHandler;

  constructor(name: string) {
    this.logger = pino({ name });
    this.errorHandler = new ErrorHandler();
  }

  /**
   * Execute middleware with proper error handling and tracing
   */
  protected async executeWithTracing<T = void>(
    methodName: string,
    request: FastifyRequest,
    reply: FastifyReply,
    handler: () => Promise<T>
  ): Promise<T | void> {
    const tracer = trace.getTracer(CONFIG.SERVICE_NAME);
    const span = tracer.startSpan(`${this.constructor.name}.${methodName}`);

    try {
      span.setAttributes({
        'middleware.name': this.constructor.name,
        'middleware.method': methodName,
        'http.method': request.method,
        'http.url': request.url,
        'http.route': (request as any).routerPath || 'unknown',
      });

      return await handler();
    } catch (error) {
      span.recordException(error as Error);
      
      if (error instanceof BaseError) {
        // Handle known business errors
        span.setAttributes({
          'error.type': error.constructor.name,
          'error.code': error.statusCode.toString(),
          'error.message': error.message,
        });

        this.logger.warn({
          error: error.message,
          statusCode: error.statusCode,
          url: request.url,
          method: request.method,
        }, `Middleware error: ${error.message}`);

        return this.errorHandler.handle(error, request, reply, span);
      } else {
        // Handle unexpected errors
        span.setAttributes({
          'error.type': 'unexpected_error',
          'error.message': error instanceof Error ? error.message : 'Unknown error',
        });

        this.logger.error({
          error,
          url: request.url,
          method: request.method,
        }, 'Unexpected middleware error');

        return this.errorHandler.handle(error, request, reply, span);
      }
    } finally {
      span.end();
    }
  }

  /**
   * Standard success response for middleware operations
   */
  protected sendSuccessResponse(reply: FastifyReply, data?: any, message = 'Operation successful'): void {
    reply.status(200).send({
      success: true,
      message,
      data: data || null,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log middleware execution details
   */
  protected logMiddlewareExecution(
    method: string,
    request: FastifyRequest,
    details?: Record<string, any>
  ): void {
    this.logger.debug({
      middleware: this.constructor.name,
      method,
      url: request.url,
      httpMethod: request.method,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      ...details,
    }, `Middleware executed: ${method}`);
  }

  /**
   * Extract bearer token from Authorization header
   */
  protected extractBearerToken(request: FastifyRequest): string | null {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  /**
   * Validate required headers
   */
  protected validateHeaders(request: FastifyRequest, requiredHeaders: string[]): string[] {
    const missing: string[] = [];
    
    for (const header of requiredHeaders) {
      if (!request.headers[header.toLowerCase()]) {
        missing.push(header);
      }
    }
    
    return missing;
  }
}