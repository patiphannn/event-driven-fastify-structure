import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { AuthMiddleware } from '../../presentation/middleware/AuthMiddleware';
import { UnauthorizedError, ForbiddenError } from '../../shared/errors/ErrorTypes';

// Mock dependencies
jest.mock('jsonwebtoken');

// Mock the singletons
const mockRedisClient = {
  get: jest.fn(),
  setEx: jest.fn()
};

const mockDatabaseClient = {
  user: {
    findUnique: jest.fn()
  }
};

// Mock the singleton instances
jest.mock('../../infrastructure/cache/RedisClient', () => ({
  RedisClient: {
    getInstance: () => mockRedisClient
  }
}));

jest.mock('../../infrastructure/database/DatabaseClient', () => ({
  DatabaseClient: {
    getInstance: () => mockDatabaseClient
  }
}));

describe('AuthMiddleware', () => {
  let middleware: AuthMiddleware;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    middleware = new AuthMiddleware({
      useRedisCache: true,
      verifyRoleFromDB: true
    });

    mockRequest = {
      headers: {},
      url: '/api/users'
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis() // Add status method for error handling
    };
  });

  describe('extractBearerToken', () => {
    it('should extract token from Authorization header', () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token-123'
      };

      const token = (middleware as any).extractBearerToken(mockRequest);

      expect(token).toBe('valid-token-123');
    });

    it('should return null for missing Authorization header', () => {
      mockRequest.headers = {};

      const token = (middleware as any).extractBearerToken(mockRequest);

      expect(token).toBeNull();
    });

    it('should return null for invalid Authorization format', () => {
      mockRequest.headers = {
        authorization: 'Invalid token-123'
      };

      const token = (middleware as any).extractBearerToken(mockRequest);

      expect(token).toBeNull();
    });
  });

  describe('authenticate', () => {
    it('should authenticate valid token successfully', async () => {
      const validToken = 'valid-token-123';
      const decodedToken = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User'
      };

      const dbUser = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      };

      mockRequest.headers = {
        authorization: `Bearer ${validToken}`
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);
      mockDatabaseClient.user.findUnique.mockResolvedValue(dbUser);
      mockRedisClient.get.mockResolvedValue(null); // Cache miss

      await middleware.authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(jwt.verify).toHaveBeenCalledWith(validToken, expect.any(String));
      expect(mockRequest.user).toBeDefined();
    });

    it('should handle missing token when auth is required', async () => {
      mockRequest.headers = {};

      // Since middleware uses ErrorHandler, we expect reply to be called with error response
      await middleware.authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should handle invalid token', async () => {
      const invalidToken = 'invalid-token';

      mockRequest.headers = {
        authorization: `Bearer ${invalidToken}`
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await middleware.authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getUserInfo', () => {
    const mockDecodedToken = {
      id: '123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user'
    };

    it('should get user info from database when not in cache', async () => {
      const userId = '123';
      const dbUser = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockRedisClient.get.mockResolvedValue(null);
      mockDatabaseClient.user.findUnique.mockResolvedValue(dbUser);

      const result = await (middleware as any).getUserInfo(mockDecodedToken);

      expect(mockDatabaseClient.user.findUnique).toHaveBeenCalled();
      expect(result.id).toBe('123');
    });

    it('should handle Redis errors gracefully', async () => {
      const dbUser = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      };

      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
      mockDatabaseClient.user.findUnique.mockResolvedValue(dbUser);

      const result = await (middleware as any).getUserInfo(mockDecodedToken);

      expect(result.id).toBe('123');
    });

    it('should return null when database user not found', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockDatabaseClient.user.findUnique.mockResolvedValue(null); // User not found

      const result = await (middleware as any).getUserInfo(mockDecodedToken);

      expect(result).toBeNull();
    });

    it('should fallback to JWT payload when database error occurs', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockDatabaseClient.user.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await (middleware as any).getUserInfo(mockDecodedToken);

      expect(result).toEqual({
        ...mockDecodedToken,
        permissions: [] // Default permissions for fallback
      });
    });
  });
});