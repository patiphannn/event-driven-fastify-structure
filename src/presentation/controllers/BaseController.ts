import { FastifyReply } from 'fastify';
import { trace, Tracer, Span } from '@opentelemetry/api';
import pino from 'pino';
import { ErrorHandler } from '../../shared/utils/ErrorHandler';

/**
 * Standard success response format
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ResponseMeta;
  timestamp: string;
  traceId?: string;
}

/**
 * Response metadata for additional information
 */
export interface ResponseMeta {
  pagination?: PaginationMeta;
  version?: string;
  [key: string]: unknown;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Base controller providing standardized response handling,
 * error management, and common functionality for all controllers
 */
export abstract class BaseController {
  protected readonly tracer: Tracer;
  protected readonly logger: pino.Logger;
  protected readonly errorHandler: ErrorHandler;

  constructor(serviceName: string) {
    this.tracer = trace.getTracer(serviceName);
    this.logger = pino({ name: this.constructor.name });
    this.errorHandler = new ErrorHandler();
  }

  /**
   * Send standardized success response
   * 
   * @param reply - Fastify reply object
   * @param data - Response data
   * @param statusCode - HTTP status code (default: 200)
   * @param meta - Optional metadata
   * @returns Formatted success response
   */
  protected successResponse<T>(
    reply: FastifyReply,
    data: T,
    statusCode: number = 200,
    meta?: ResponseMeta
  ): FastifyReply {
    const response: SuccessResponse<T> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      traceId: this.getTraceId(),
    };

    if (meta) {
      response.meta = meta;
    }

    return reply.status(statusCode).send(response);
  }

  /**
   * Send standardized success response for created resources
   * 
   * @param reply - Fastify reply object
   * @param data - Created resource data
   * @param meta - Optional metadata
   * @returns Formatted success response with 201 status
   */
  protected createdResponse<T>(
    reply: FastifyReply,
    data: T,
    meta?: ResponseMeta
  ): FastifyReply {
    return this.successResponse(reply, data, 201, meta);
  }

  /**
   * Send standardized success response for accepted operations (async)
   * 
   * @param reply - Fastify reply object
   * @param data - Operation acknowledgment data
   * @param meta - Optional metadata
   * @returns Formatted success response with 202 status
   */
  protected acceptedResponse<T>(
    reply: FastifyReply,
    data: T,
    meta?: ResponseMeta
  ): FastifyReply {
    return this.successResponse(reply, data, 202, meta);
  }

  /**
   * Send standardized success response with pagination metadata
   * 
   * @param reply - Fastify reply object
   * @param data - Response data (usually an array)
   * @param pagination - Pagination metadata
   * @param statusCode - HTTP status code (default: 200)
   * @returns Formatted success response with pagination
   */
  protected paginatedResponse<T>(
    reply: FastifyReply,
    data: T,
    pagination: PaginationMeta,
    statusCode: number = 200
  ): FastifyReply {
    return this.successResponse(reply, data, statusCode, { pagination });
  }

  /**
   * Get current trace ID for request correlation
   * 
   * @returns Current trace ID or empty string if not available
   */
  protected getTraceId(): string {
    const activeSpan = trace.getActiveSpan();
    return activeSpan?.spanContext().traceId || '';
  }

  /**
   * Start a new tracing span with consistent naming
   * 
   * @param operationName - Name of the operation
   * @param attributes - Optional span attributes
   * @returns Started span
   */
  protected startSpan(operationName: string, attributes?: Record<string, string | number | boolean>): Span {
    const span = this.tracer.startSpan(`${this.constructor.name}.${operationName}`);
    
    if (attributes) {
      span.setAttributes(attributes);
    }

    return span;
  }

  /**
   * Add standard HTTP request attributes to span
   * 
   * @param span - OpenTelemetry span
   * @param method - HTTP method
   * @param url - Request URL
   * @param additionalAttributes - Additional custom attributes
   */
  protected addRequestAttributes(
    span: Span,
    method: string,
    url: string,
    additionalAttributes?: Record<string, string | number | boolean>
  ): void {
    const attributes: Record<string, string | number | boolean> = {
      'http.method': method,
      'http.url': url,
      'service.name': this.constructor.name,
    };

    if (additionalAttributes) {
      Object.assign(attributes, additionalAttributes);
    }

    span.setAttributes(attributes);
  }

  /**
   * Add success attributes to span
   * 
   * @param span - OpenTelemetry span
   * @param statusCode - HTTP status code
   * @param additionalAttributes - Additional custom attributes
   */
  protected addSuccessAttributes(
    span: Span,
    statusCode: number,
    additionalAttributes?: Record<string, string | number | boolean>
  ): void {
    const attributes: Record<string, string | number | boolean> = {
      'http.status_code': statusCode,
      'operation.success': true,
    };

    if (additionalAttributes) {
      Object.assign(attributes, additionalAttributes);
    }

    span.setAttributes(attributes);
  }

  /**
   * Calculate pagination metadata
   * 
   * @param page - Current page number
   * @param limit - Items per page
   * @param total - Total number of items
   * @returns Pagination metadata
   */
  protected calculatePagination(page: number, limit: number, total: number): PaginationMeta {
    const totalPages = Math.ceil(total / limit);
    
    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Validate pagination parameters
   * 
   * @param page - Page number from request
   * @param limit - Limit from request
   * @param maxLimit - Maximum allowed limit
   * @returns Validated pagination parameters
   * @throws ValidationError if parameters are invalid
   */
  protected validatePagination(page: number, limit: number, maxLimit: number = 100): { page: number; limit: number } {
    const { ValidationError } = require('../../shared/errors');

    if (page < 1) {
      throw new ValidationError('Page must be >= 1', { page });
    }

    if (limit < 1) {
      throw new ValidationError('Limit must be >= 1', { limit });
    }

    if (limit > maxLimit) {
      throw new ValidationError(`Limit must be <= ${maxLimit}`, { limit, maxLimit });
    }

    return { page, limit };
  }

  /**
   * Log operation start with context
   * 
   * @param operation - Operation name
   * @param context - Operation context
   */
  protected logOperationStart(operation: string, context: Record<string, unknown>): void {
    this.logger.info({ operation, ...context }, `Starting ${operation}`);
  }

  /**
   * Log operation success with context
   * 
   * @param operation - Operation name
   * @param context - Operation context
   */
  protected logOperationSuccess(operation: string, context: Record<string, unknown>): void {
    this.logger.info({ operation, ...context }, `${operation} completed successfully`);
  }

  /**
   * Log operation warning with context
   * 
   * @param operation - Operation name
   * @param context - Operation context
   * @param message - Warning message
   */
  protected logOperationWarning(operation: string, context: Record<string, unknown>, message: string): void {
    this.logger.warn({ operation, ...context }, `${operation} warning: ${message}`);
  }
}