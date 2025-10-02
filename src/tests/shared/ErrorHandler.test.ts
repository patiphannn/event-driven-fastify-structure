import { ErrorHandler } from '../../shared/utils/ErrorHandler';
import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError } from '../../shared/errors/ErrorTypes';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    errorHandler = new ErrorHandler();
    mockRequest = {
      method: 'GET',
      url: '/test',
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1'
    };
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis()
    };
  });

  describe('handle', () => {
    it('should handle ValidationError correctly', async () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      
      await errorHandler.handle(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'common.validation_error',
            message: 'Invalid input'
          })
        })
      );
    });

    it('should handle UnauthorizedError correctly', async () => {
      const error = new UnauthorizedError('Invalid token');
      
      await errorHandler.handle(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'common.unauthorized',
            message: 'Invalid token'
          })
        })
      );
    });

    it('should handle ForbiddenError correctly', async () => {
      const error = new ForbiddenError('Access denied');
      
      await errorHandler.handle(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should handle NotFoundError correctly', async () => {
      const error = new NotFoundError('User not found');
      
      await errorHandler.handle(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should handle ConflictError correctly', async () => {
      const error = new ConflictError('Email already exists');
      
      await errorHandler.handle(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });

    it('should handle generic Error as internal server error', async () => {
      const error = new Error('Unexpected error');
      
      await errorHandler.handle(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'common.internal_server_error',
            message: 'Unexpected error'
          })
        })
      );
    });

    it('should handle validation-related generic error', async () => {
      const error = new Error('validation failed for field');
      
      await errorHandler.handle(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'common.validation_error'
          })
        })
      );
    });

    it('should include context in error response', async () => {
      const error = new ValidationError('Invalid data', { field: 'email', value: 'invalid' });
      
      await errorHandler.handle(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: { field: 'email', value: 'invalid' }
          })
        })
      );
    });

    it('should include request information in error response', async () => {
      const error = new Error('Test error');
      
      await errorHandler.handle(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test',
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle span recording', async () => {
      const mockSpan = {
        recordException: jest.fn(),
        setAttributes: jest.fn()
      };
      
      const error = new ValidationError('Test error');
      
      await errorHandler.handle(error, mockRequest as FastifyRequest, mockReply as FastifyReply, mockSpan as any);

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'error.type': 'common.validation_error',
          'error.message': 'Test error',
          'error.statusCode': '400'
        })
      );
    });

    it('should handle null/undefined errors', async () => {
      await errorHandler.handle(null, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'common.internal_server_error'
          })
        })
      );
    });

    it('should handle string errors', async () => {
      await errorHandler.handle('String error message', mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });
});