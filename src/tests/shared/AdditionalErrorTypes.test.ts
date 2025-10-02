import {
  UnprocessableEntityError,
  BadGatewayError,
  ServiceUnavailableError,
  GatewayTimeoutError,
  AuthenticationError,
  AuthorizationError,
  InfrastructureError,
  DatabaseError,
  ExternalServiceError,
  DomainError,
  isOperationalError,
  isBaseError
} from '../../shared/errors/ErrorTypes';

describe('Additional Error Types', () => {
  describe('UnprocessableEntityError', () => {
    it('should create error with default message', () => {
      const error = new UnprocessableEntityError();
      
      expect(error.message).toBe('Unprocessable entity');
      expect(error.statusCode).toBe(422);
      expect(error.errorCode).toBe('common.unprocessable_entity');
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom message and context', () => {
      const context = { field: 'email', reason: 'invalid format' };
      const error = new UnprocessableEntityError('Invalid input data', context);
      
      expect(error.message).toBe('Invalid input data');
      expect(error.context).toEqual(context);
    });
  });

  describe('BadGatewayError', () => {
    it('should create error with default message', () => {
      const error = new BadGatewayError();
      
      expect(error.message).toBe('Bad gateway');
      expect(error.statusCode).toBe(502);
      expect(error.errorCode).toBe('common.bad_gateway');
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom message', () => {
      const error = new BadGatewayError('External API failed');
      
      expect(error.message).toBe('External API failed');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create error with default message', () => {
      const error = new ServiceUnavailableError();
      
      expect(error.message).toBe('Service unavailable');
      expect(error.statusCode).toBe(503);
      expect(error.errorCode).toBe('common.service_unavailable');
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom context', () => {
      const context = { service: 'database', retryAfter: 30 };
      const error = new ServiceUnavailableError('Database maintenance', context);
      
      expect(error.message).toBe('Database maintenance');
      expect(error.context).toEqual(context);
    });
  });

  describe('GatewayTimeoutError', () => {
    it('should create error with default message', () => {
      const error = new GatewayTimeoutError();
      
      expect(error.message).toBe('Gateway timeout');
      expect(error.statusCode).toBe(504);
      expect(error.errorCode).toBe('common.gateway_timeout');
      expect(error.isOperational).toBe(true);
    });

    it('should create error with timeout context', () => {
      const context = { timeout: 30000, service: 'payment-api' };
      const error = new GatewayTimeoutError('Payment service timeout', context);
      
      expect(error.message).toBe('Payment service timeout');
      expect(error.context).toEqual(context);
    });
  });

  describe('Legacy Error Aliases', () => {
    it('should create AuthenticationError as UnauthorizedError', () => {
      const error = new AuthenticationError('Invalid credentials');
      
      expect(error.message).toBe('Invalid credentials');
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe('common.unauthorized');
    });

    it('should create AuthorizationError as ForbiddenError', () => {
      const error = new AuthorizationError('Access denied');
      
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe('common.forbidden');
    });

    it('should create InfrastructureError as InternalServerError', () => {
      const error = new InfrastructureError('System failure');
      
      expect(error.message).toBe('System failure');
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe('common.internal_server_error');
    });

    it('should create DatabaseError as InternalServerError', () => {
      const error = new DatabaseError('Connection failed');
      
      expect(error.message).toBe('Connection failed');
      expect(error.statusCode).toBe(500);
    });

    it('should create ExternalServiceError as BadGatewayError', () => {
      const error = new ExternalServiceError('API unavailable');
      
      expect(error.message).toBe('API unavailable');
      expect(error.statusCode).toBe(502);
    });

    it('should create DomainError as ValidationError', () => {
      const error = new DomainError('Business rule violation');
      
      expect(error.message).toBe('Business rule violation');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('Type Guards', () => {
    it('should identify operational errors correctly', () => {
      const operationalError = new UnprocessableEntityError('Test error');
      const nonOperationalError = new Error('Regular error');
      
      expect(isOperationalError(operationalError)).toBe(true);
      expect(isOperationalError(nonOperationalError)).toBe(false);
      expect(isOperationalError(null)).toBe(false);
      expect(isOperationalError(undefined)).toBe(false);
    });

    it('should identify BaseError instances correctly', () => {
      const baseError = new BadGatewayError('Test error');
      const regularError = new Error('Regular error');
      
      expect(isBaseError(baseError)).toBe(true);
      expect(isBaseError(regularError)).toBe(false);
      expect(isBaseError('string')).toBe(false);
      expect(isBaseError({})).toBe(false);
    });

    it('should handle edge cases in type guards', () => {
      expect(isOperationalError('')).toBe(false);
      expect(isOperationalError(0)).toBe(false);
      expect(isOperationalError({})).toBe(false);
      
      expect(isBaseError('')).toBe(false);
      expect(isBaseError(123)).toBe(false);
      expect(isBaseError([])).toBe(false);
    });
  });
});