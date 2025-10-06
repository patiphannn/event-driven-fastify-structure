import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { BaseMiddleware } from './BaseMiddleware';
import { ValidationError, UnauthorizedError, ForbiddenError } from '../../shared/errors';
import { UserInfo } from '../../shared/types/UserInfo';
import { CONFIG } from '../../shared/config';
import { DatabaseClient } from '../../infrastructure/database/DatabaseClient';
import { RedisClient } from '../../infrastructure/cache/RedisClient';

// Extend FastifyRequest interface to include user property
declare module 'fastify' {
  interface FastifyRequest {
    user?: UserInfo;
  }
}

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role?: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface AuthMiddlewareOptions {
  jwtSecret?: string;
  requireAuth?: boolean;
  requiredRole?: string;
  requiredPermissions?: string[];
  skipPaths?: string[];
  // Redis Cache options
  verifyRoleFromDB?: boolean;  // ตรวจสอบ role จาก database
  useRedisCache?: boolean;     // ใช้ Redis cache แทน memory cache
  cacheTTL?: number;           // cache time-to-live (seconds for Redis)
  cachePrefix?: string;        // Redis key prefix
}

/**
 * Redis-powered Auth Middleware with JWT + Database + Redis Cache
 * 
 * Features:
 * - JWT token validation (fast)
 * - Database role verification (real-time)
 * - Redis cache (distributed, persistent)
 * - Configurable cache TTL
 * - Redis key prefix for organization
 * 
 * ตัวอย่างการใช้งาน:
 * new AuthMiddleware({ 
 *   verifyRoleFromDB: true, 
 *   useRedisCache: true,
 *   cacheTTL: 300, // 5 minutes in seconds
 *   cachePrefix: 'auth:user:'
 * })
 */
export class AuthMiddleware extends BaseMiddleware {
  private readonly jwtSecret: string;
  private readonly options: Required<AuthMiddlewareOptions>;
  private readonly DEFAULT_CACHE_TTL = 300; // 5 minutes in seconds (Redis standard)

  constructor(options: AuthMiddlewareOptions = {}) {
    super('AuthMiddleware');
    
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.options = {
      jwtSecret: this.jwtSecret,
      requireAuth: options.requireAuth ?? true,
      requiredRole: options.requiredRole || '',
      requiredPermissions: options.requiredPermissions || [],
      skipPaths: options.skipPaths || [],
      // Redis Cache options with sensible defaults
      verifyRoleFromDB: options.verifyRoleFromDB ?? (process.env.AUTH_VERIFY_ROLE_FROM_DB !== 'false'),   // Default: ตรวจสอบจาก DB unless disabled
      useRedisCache: options.useRedisCache ?? true,         // Default: ใช้ Redis cache
      cacheTTL: options.cacheTTL ?? this.DEFAULT_CACHE_TTL, // Default: 5 minutes
      cachePrefix: options.cachePrefix || 'auth:user:',     // Default: auth:user: prefix
    };

    if (this.jwtSecret === 'default-secret-change-in-production') {
      this.logger.warn('Using default JWT secret. Change this in production!');
    }

    if (this.options.verifyRoleFromDB && this.options.useRedisCache) {
      this.logger.info('Redis-powered auth enabled: JWT + Database + Redis Cache', { 
        cacheEnabled: this.options.useRedisCache,
        cacheTTL: this.options.cacheTTL + 's',
        cachePrefix: this.options.cachePrefix
      });
    }
  }

  /**
   * Hybrid authentication middleware
   * 1. Validate JWT token (fast)
   * 2. Get fresh user info from DB/cache (real-time role)
   * 3. Attach complete user info to request
   */
  authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    return this.executeWithTracing('authenticate', request, reply, async () => {
      // Check if path should be skipped
      if (this.shouldSkipPath(request.url)) {
        this.logMiddlewareExecution('authenticate', request, { skipped: true, path: request.url });
        return;
      }

      const token = this.extractBearerToken(request);
      
      if (!token) {
        if (!this.options.requireAuth) {
          this.logMiddlewareExecution('authenticate', request, { optional: true, tokenPresent: false });
          return;
        }
        
        throw new UnauthorizedError('Authorization token is required', { code: 'MISSING_TOKEN' });
      }

      try {
        // Step 1: Verify JWT token (get basic user info)
        const payload = this.verifyToken(token);
        this.validateTokenPayload(payload);
        
        // Step 2: Get fresh user info (role from DB or cache)
        const userInfo = await this.getUserInfo(payload);
        
        if (!userInfo) {
          throw new UnauthorizedError('User not found or deactivated', { code: 'USER_NOT_FOUND' });
        }

        // Step 3: Check role and permissions with fresh data
        if (this.options.requiredRole && userInfo.role !== this.options.requiredRole) {
          throw new ForbiddenError(`Required role: ${this.options.requiredRole}`, { code: 'INSUFFICIENT_ROLE' });
        }

        if (this.options.requiredPermissions.length > 0) {
          this.validatePermissions(userInfo, this.options.requiredPermissions);
        }

        // Step 4: Attach fresh user info to request
        request.user = userInfo;

        this.logMiddlewareExecution('authenticate', request, {
          userId: userInfo.id,
          email: userInfo.email,
          role: userInfo.role,
          roleSource: this.options.verifyRoleFromDB ? 'database' : 'jwt',
          cached: userInfo._cached || false,
          authSuccess: true,
        });

      } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
          throw new UnauthorizedError('Invalid or expired token', { code: 'INVALID_TOKEN' });
        }
        throw error;
      }
    });
  };

  /**
   * Optional authentication middleware
   * Adds user info if token is present but doesn't fail if missing
   */
  optionalAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const originalRequireAuth = this.options.requireAuth;
    this.options.requireAuth = false;

    try {
      await this.authenticate(request, reply);
    } finally {
      this.options.requireAuth = originalRequireAuth;
    }
  };

  /**
   * Role-based authorization middleware factory
   */
  requireRole = (role: string) => {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      return this.executeWithTracing('requireRole', request, reply, async () => {
        if (!request.user) {
          throw new UnauthorizedError('Authentication required', { code: 'NOT_AUTHENTICATED' });
        }

        if (request.user.role !== role) {
          throw new ForbiddenError(`Required role: ${role}`, { code: 'INSUFFICIENT_ROLE' });
        }

        this.logMiddlewareExecution('requireRole', request, {
          userId: request.user.id,
          userRole: request.user.role,
          requiredRole: role,
          authorized: true,
        });
      });
    };
  };

  /**
   * Permission-based authorization middleware factory
   */
  requirePermissions = (permissions: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      return this.executeWithTracing('requirePermissions', request, reply, async () => {
        if (!request.user) {
          throw new UnauthorizedError('Authentication required', { code: 'NOT_AUTHENTICATED' });
        }

        this.validatePermissions(request.user, permissions);

        this.logMiddlewareExecution('requirePermissions', request, {
          userId: request.user.id,
          userPermissions: request.user.permissions,
          requiredPermissions: permissions,
          authorized: true,
        });
      });
    };
  };

  /**
   * Get user info from Redis cache or database
   * 
   * Flow:
   * 1. Check Redis cache first (if enabled)
   * 2. If not in cache, query database (if enabled)
   * 3. If DB disabled, use JWT payload only
   * 4. Store result in Redis for future requests
   */
  private async getUserInfo(payload: JwtPayload): Promise<UserInfo | null> {
    const userId = payload.id;
    const cacheKey = `${this.options.cachePrefix}${userId}`;

    // Step 1: Check Redis cache first (if enabled)
    if (this.options.useRedisCache) {
      try {
        const cachedData = await RedisClient.get(cacheKey);
        if (cachedData) {
          const userInfo = JSON.parse(cachedData) as UserInfo;
          this.logger.debug('User info retrieved from Redis cache', { userId, cacheKey });
          return { ...userInfo, _cached: true };
        }
      } catch (error) {
        this.logger.warn('Redis cache read failed, continuing without cache', { 
          userId, 
          error: (error as Error).message 
        });
      }
    }

    // Step 2: If not using DB verification, use JWT payload only
    if (!this.options.verifyRoleFromDB) {
      const userInfo: UserInfo = {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        permissions: payload.permissions || [],
      };
      
      // Cache JWT-based user info in Redis
      if (this.options.useRedisCache) {
        await this.cacheUserInfo(cacheKey, userInfo);
      }
      
      return userInfo;
    }

    // Step 3: Fetch from database for real-time role/permissions
    try {
      const prisma = DatabaseClient.getInstance();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          deletedAt: true,
          // NOTE: role และ permissions ยังไม่มีใน User table
          // ต้องเพิ่ม fields เหล่านี้ใน database schema
          // หรือสร้าง separate UserRole table
        }
      });

      if (!user || user.deletedAt) {
        this.logger.warn('User not found or deleted', { userId });
        return null;
      }

      // สร้าง UserInfo จาก database + JWT payload
      const userInfo: UserInfo = {
        id: user.id,
        email: user.email,
        name: user.name,
        // TODO: ดึง role จาก database table
        // ตอนนี้ใช้จาก JWT ก่อน จนกว่าจะมี role table
        role: payload.role || 'user',
        permissions: payload.permissions || [],
      };

      // Step 4: Cache in Redis (if enabled)
      if (this.options.useRedisCache) {
        await this.cacheUserInfo(cacheKey, userInfo);
      }

      this.logger.debug('User info retrieved from database', { 
        userId, 
        role: userInfo.role,
        cached: false
      });
      return userInfo;

    } catch (error) {
      this.logger.error('Failed to fetch user from database', { 
        userId, 
        error: (error as Error).message 
      });
      
      // Fallback to JWT payload if database fails
      this.logger.warn('Falling back to JWT payload due to database error', { userId });
      const fallbackUserInfo: UserInfo = {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        permissions: payload.permissions || [],
      };
      
      return fallbackUserInfo;
    }
  }

  /**
   * Cache user info in Redis
   */
  private async cacheUserInfo(cacheKey: string, userInfo: UserInfo): Promise<void> {
    try {
      const serializedUserInfo = JSON.stringify(userInfo);
      await RedisClient.set(cacheKey, serializedUserInfo, this.options.cacheTTL);
      this.logger.debug('User info cached in Redis', { 
        cacheKey, 
        ttl: this.options.cacheTTL 
      });
    } catch (error) {
      this.logger.warn('Failed to cache user info in Redis', { 
        cacheKey, 
        error: (error as Error).message 
      });
    }
  }

  /**
   * Clear user cache in Redis (useful when user role changes)
   * 
   * เรียกใช้เมื่อ:
   * - User role เปลี่ยน
   * - User permissions เปลี่ยน
   * - ต้องการ force refresh user info
   * - User ถูก deactivate
   */
  public async clearUserCache(userId?: string): Promise<void> {
    try {
      if (userId) {
        const cacheKey = `${this.options.cachePrefix}${userId}`;
        await RedisClient.del(cacheKey);
        this.logger.info('Cleared user cache in Redis', { userId, cacheKey });
      } else {
        // Clear all auth cache (pattern-based deletion)
        const client = await RedisClient.getInstance();
        const keys = await client.keys(`${this.options.cachePrefix}*`);
        
        if (keys.length > 0) {
          await client.del(keys);
          this.logger.info('Cleared all auth cache in Redis', { 
            clearedCount: keys.length,
            pattern: `${this.options.cachePrefix}*`
          });
        } else {
          this.logger.info('No auth cache entries to clear');
        }
      }
    } catch (error) {
      this.logger.error('Failed to clear cache in Redis', { 
        userId, 
        error: (error as Error).message 
      });
    }
  }

  /**
   * Get Redis cache statistics (for monitoring)
   */
  public async getCacheStats(): Promise<{
    totalKeys: number;
    authKeys: number;
    authPattern: string;
    redisInfo?: any;
  }> {
    try {
      const client = await RedisClient.getInstance();
      const authKeys = await client.keys(`${this.options.cachePrefix}*`);
      const allKeys = await client.keys('*');
      
      // Get Redis memory info (optional)
      let redisInfo;
      try {
        redisInfo = await client.info('memory');
      } catch (err) {
        // Redis info might not be available in some environments
      }

      return {
        totalKeys: allKeys.length,
        authKeys: authKeys.length,
        authPattern: `${this.options.cachePrefix}*`,
        redisInfo,
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats', { error: (error as Error).message });
      return {
        totalKeys: 0,
        authKeys: 0,
        authPattern: `${this.options.cachePrefix}*`,
      };
    }
  }

  /**
   * Verify JWT token and return payload
   */
  private verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired', { code: 'TOKEN_EXPIRED' });
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token format', { code: 'INVALID_TOKEN_FORMAT' });
      }
      throw error;
    }
  }

  /**
   * Validate token payload structure
   */
  private validateTokenPayload(payload: any): asserts payload is JwtPayload {
    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedError('Invalid token payload', { code: 'INVALID_PAYLOAD' });
    }

    const requiredFields = ['id', 'email', 'name'];
    const missingFields = requiredFields.filter(field => !payload[field]);

    if (missingFields.length > 0) {
      throw new UnauthorizedError(
        `Token payload missing required fields: ${missingFields.join(', ')}`,
        { code: 'INCOMPLETE_PAYLOAD' }
      );
    }
  }

  /**
   * Validate user permissions
   */
  private validatePermissions(user: UserInfo | JwtPayload, requiredPermissions: string[]): void {
    const userPermissions = user.permissions || [];
    const missingPermissions = requiredPermissions.filter(
      permission => !userPermissions.includes(permission)
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenError(
        `Missing required permissions: ${missingPermissions.join(', ')}`,
        { code: 'INSUFFICIENT_PERMISSIONS' }
      );
    }
  }

  /**
   * Check if the current path should skip authentication
   */
  private shouldSkipPath(path: string): boolean {
    return this.options.skipPaths.some(skipPath => {
      if (skipPath.includes('*')) {
        const regex = new RegExp(skipPath.replace(/\*/g, '.*'));
        return regex.test(path);
      }
      return path.startsWith(skipPath);
    });
  }

  /**
   * Create middleware instance with specific options
   */
  static create(options: AuthMiddlewareOptions = {}): AuthMiddleware {
    return new AuthMiddleware(options);
  }

  /**
   * Factory method for required authentication
   */
  static required(options: Omit<AuthMiddlewareOptions, 'requireAuth'> = {}): AuthMiddleware {
    return new AuthMiddleware({ ...options, requireAuth: true });
  }

  /**
   * Factory method for optional authentication
   */
  static optional(options: Omit<AuthMiddlewareOptions, 'requireAuth'> = {}): AuthMiddleware {
    return new AuthMiddleware({ ...options, requireAuth: false });
  }
}