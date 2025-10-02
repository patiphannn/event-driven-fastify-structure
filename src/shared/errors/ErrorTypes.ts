/**
 * Base error class for all application errors
 * Provides consistent error structure and metadata
 */
export abstract class BaseError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;
  abstract readonly isOperational: boolean;
  readonly timestamp: string;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string, 
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.context = context;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging and responses
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * 400 Bad Request - Validation errors, malformed requests
 */
export class ValidationError extends BaseError {
  readonly statusCode = 400;
  readonly errorCode = 'common.invalid_request';
  readonly isOperational = true;

  constructor(message: string = 'Invalid request data', context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends BaseError {
  readonly statusCode = 401;
  readonly errorCode = 'common.unauthorized';
  readonly isOperational = true;

  constructor(message: string = 'Authentication required', context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * 403 Forbidden - Access denied, insufficient permissions
 */
export class ForbiddenError extends BaseError {
  readonly statusCode = 403;
  readonly errorCode = 'common.forbidden';
  readonly isOperational = true;

  constructor(message: string = 'Access denied', context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends BaseError {
  readonly statusCode = 404;
  readonly errorCode = 'common.not_found';
  readonly isOperational = true;

  constructor(message: string = 'Resource not found', context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * 409 Conflict - Resource conflict (e.g., duplicate email)
 */
export class ConflictError extends BaseError {
  readonly statusCode = 409;
  readonly errorCode = 'common.conflict';
  readonly isOperational = true;

  constructor(message: string = 'Resource conflict', context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * 422 Unprocessable Entity - Business logic validation errors
 */
export class UnprocessableEntityError extends BaseError {
  readonly statusCode = 422;
  readonly errorCode = 'common.unprocessable_entity';
  readonly isOperational = true;

  constructor(message: string = 'Unprocessable entity', context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * 500 Internal Server Error - Unexpected server errors
 */
export class InternalServerError extends BaseError {
  readonly statusCode = 500;
  readonly errorCode = 'common.internal_server_error';
  readonly isOperational = true;

  constructor(message: string = 'Internal server error', context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * 502 Bad Gateway - External service errors
 */
export class BadGatewayError extends BaseError {
  readonly statusCode = 502;
  readonly errorCode = 'common.bad_gateway';
  readonly isOperational = true;

  constructor(message: string = 'Bad gateway', context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class ServiceUnavailableError extends BaseError {
  readonly statusCode = 503;
  readonly errorCode = 'common.service_unavailable';
  readonly isOperational = true;

  constructor(message: string = 'Service unavailable', context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * 504 Gateway Timeout - External service timeout
 */
export class GatewayTimeoutError extends BaseError {
  readonly statusCode = 504;
  readonly errorCode = 'common.gateway_timeout';
  readonly isOperational = true;

  constructor(message: string = 'Gateway timeout', context?: Record<string, unknown>) {
    super(message, context);
  }
}

/**
 * Legacy aliases for backward compatibility
 * @deprecated Use specific error classes instead
 */
export class AuthenticationError extends UnauthorizedError {}
export class AuthorizationError extends ForbiddenError {}
export class InfrastructureError extends InternalServerError {}
export class DatabaseError extends InternalServerError {}
export class ExternalServiceError extends BadGatewayError {}
export class DomainError extends ValidationError {}

/**
 * Type guard to check if error is operational
 */
export function isOperationalError(error: unknown): error is BaseError {
  return error instanceof BaseError && error.isOperational;
}

/**
 * Type guard to check if error is a BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}
