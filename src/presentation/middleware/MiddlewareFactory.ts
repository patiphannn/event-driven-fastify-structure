import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthMiddleware, AuthMiddlewareOptions } from './AuthMiddleware';

/**
 * Middleware Factory for creating optimized middleware instances
 * Provides reusable middleware configurations and improves performance
 */
export class MiddlewareFactory {
  private static authInstances = new Map<string, AuthMiddleware>();

  /**
   * Get or create an auth middleware instance with caching for performance
   */
  static getAuthMiddleware(options: AuthMiddlewareOptions = {}): AuthMiddleware {
    const key = JSON.stringify(options);
    
    if (!this.authInstances.has(key)) {
      this.authInstances.set(key, new AuthMiddleware(options));
    }
    
    return this.authInstances.get(key)!;
  }

  /**
   * Create standard authentication middleware for protected routes
   */
  static createAuth(options: AuthMiddlewareOptions = {}) {
    const middleware = this.getAuthMiddleware({ ...options, requireAuth: true });
    return middleware.authenticate;
  }

  /**
   * Create optional authentication middleware for public routes
   */
  static createOptionalAuth(options: AuthMiddlewareOptions = {}) {
    const middleware = this.getAuthMiddleware({ ...options, requireAuth: false });
    return middleware.optionalAuth;
  }

  /**
   * Create role-based authorization middleware
   */
  static createRoleAuth(role: string, options: AuthMiddlewareOptions = {}) {
    const middleware = this.getAuthMiddleware({ ...options, requiredRole: role });
    return middleware.authenticate;
  }

  /**
   * Create permission-based authorization middleware
   */
  static createPermissionAuth(permissions: string[], options: AuthMiddlewareOptions = {}) {
    const middleware = this.getAuthMiddleware({ ...options, requiredPermissions: permissions });
    return middleware.authenticate;
  }

  /**
   * Create composite middleware that combines authentication with role/permission checks
   */
  static createCompositeAuth(
    role?: string,
    permissions?: string[],
    options: AuthMiddlewareOptions = {}
  ) {
    const authOptions = {
      ...options,
      requiredRole: role,
      requiredPermissions: permissions || [],
    };
    
    const middleware = this.getAuthMiddleware(authOptions);
    
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      // First authenticate
      await middleware.authenticate(request, reply);
      
      // Then check role if specified
      if (role && request.user?.role !== role) {
        const roleMiddleware = middleware.requireRole(role);
        await roleMiddleware(request, reply);
      }
      
      // Then check permissions if specified
      if (permissions && permissions.length > 0) {
        const permissionMiddleware = middleware.requirePermissions(permissions);
        await permissionMiddleware(request, reply);
      }
    };
  }

  /**
   * Create middleware chain with multiple middleware functions
   */
  static createChain(...middlewares: Array<(req: FastifyRequest, reply: FastifyReply) => Promise<void>>) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      for (const middleware of middlewares) {
        await middleware(request, reply);
      }
    };
  }

  /**
   * Create conditional middleware that only executes based on a condition
   */
  static createConditional(
    condition: (request: FastifyRequest) => boolean,
    middleware: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  ) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (condition(request)) {
        await middleware(request, reply);
      }
    };
  }

  /**
   * Clear cached middleware instances (useful for testing or config changes)
   */
  static clearCache(): void {
    this.authInstances.clear();
  }
}

/**
 * Pre-configured middleware instances for common use cases
 */
export const CommonMiddleware = {
  // Standard authentication for protected routes
  auth: MiddlewareFactory.createAuth(),
  
  // Optional authentication for public routes that benefit from user context
  optionalAuth: MiddlewareFactory.createOptionalAuth(),
  
  // Admin-only routes
  adminAuth: MiddlewareFactory.createRoleAuth('admin'),
  
  // User or admin routes
  userAuth: MiddlewareFactory.createAuth({ skipPaths: ['/health', '/metrics'] }),
  
  // API routes with optional auth
  apiAuth: MiddlewareFactory.createOptionalAuth({ skipPaths: ['/api/health'] }),
  
  // Development-only middleware (skips auth in dev mode)
  devAuth: MiddlewareFactory.createConditional(
    () => process.env.NODE_ENV !== 'development',
    MiddlewareFactory.createAuth()
  ),
} as const;

/**
 * Helper functions for creating middleware configurations
 */
export const MiddlewareHelpers = {
  /**
   * Create middleware configuration for API versioning
   */
  forApiVersion: (version: string, options: AuthMiddlewareOptions = {}) => {
    return MiddlewareFactory.createAuth({
      ...options,
      skipPaths: [`/api/${version}/health`, `/api/${version}/docs`],
    });
  },

  /**
   * Create middleware configuration for specific user roles
   */
  forRole: (role: string, fallbackAuth = false) => {
    if (fallbackAuth) {
      return MiddlewareFactory.createChain(
        MiddlewareFactory.createOptionalAuth(),
        MiddlewareFactory.createConditional(
          (req) => !!req.user,
          (req, reply) => {
            const middleware = MiddlewareFactory.getAuthMiddleware({ requiredRole: role });
            return middleware.requireRole(role)(req, reply);
          }
        )
      );
    }
    return MiddlewareFactory.createRoleAuth(role);
  },

  /**
   * Create middleware configuration for resource ownership
   */
  forResourceOwner: (userIdParam = 'userId') => {
    return MiddlewareFactory.createConditional(
      (req) => {
        const params = req.params as any;
        return req.user?.id === params[userIdParam] || req.user?.role === 'admin';
      },
      async () => {
        // Access granted - user owns resource or is admin
      }
    );
  },
} as const;