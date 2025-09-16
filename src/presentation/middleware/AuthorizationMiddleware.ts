import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole, Permission, RolePermissions } from '../../shared/types/Role';
import { CONFIG } from '../../shared/config';
import { trace } from '@opentelemetry/api';
import pino from 'pino';

const logger = pino({ name: 'AuthorizationMiddleware' });

export class AuthorizationMiddleware {
  
  /**
   * Check if user has specific role
   */
  requireRole(requiredRole: UserRole) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const tracer = trace.getTracer(CONFIG.SERVICE_NAME);
      const span = tracer.startSpan('AuthorizationMiddleware.requireRole');

      try {
        const user = (request as any).user;
        
        if (!user) {
          span.setAttributes({
            'error.type': 'no_user',
            'error.message': 'User not authenticated',
          });
          logger.warn({ url: request.url }, 'Authorization failed: No user found');
          return reply.status(401).send({
            error: 'Authentication Error',
            message: 'Authentication required',
          });
        }

        const userRole = user.role || UserRole.USER;
        
        if (userRole !== requiredRole) {
          span.setAttributes({
            'error.type': 'insufficient_role',
            'error.message': `Required role: ${requiredRole}, user role: ${userRole}`,
            'user.id': user.id,
            'user.role': userRole,
            'required.role': requiredRole,
          });
          
          logger.warn({ 
            userId: user.id, 
            userRole, 
            requiredRole, 
            url: request.url 
          }, 'Authorization failed: Insufficient role');
          
          return reply.status(403).send({
            error: 'Authorization Error',
            message: `Access denied. Required role: ${requiredRole}`,
          });
        }

        span.setAttributes({
          'authorization.success': true,
          'user.id': user.id,
          'user.role': userRole,
        });

        logger.debug({ 
          userId: user.id, 
          userRole, 
          requiredRole, 
          url: request.url 
        }, 'Authorization successful: Role check passed');

      } catch (error) {
        span.recordException(error as Error);
        logger.error({ error, url: request.url }, 'Error in role authorization');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Authorization service error',
        });
      } finally {
        span.end();
      }
    };
  }

  /**
   * Check if user has specific permission
   */
  requirePermission(requiredPermission: Permission) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const tracer = trace.getTracer(CONFIG.SERVICE_NAME);
      const span = tracer.startSpan('AuthorizationMiddleware.requirePermission');

      try {
        const user = (request as any).user;
        
        if (!user) {
          span.setAttributes({
            'error.type': 'no_user',
            'error.message': 'User not authenticated',
          });
          logger.warn({ url: request.url }, 'Authorization failed: No user found');
          return reply.status(401).send({
            error: 'Authentication Error',
            message: 'Authentication required',
          });
        }

        const userRole = user.role as UserRole || UserRole.USER;
        const userPermissions = RolePermissions[userRole] || [];
        const hasPermission = userPermissions.includes(requiredPermission);
        
        if (!hasPermission) {
          span.setAttributes({
            'error.type': 'insufficient_permission',
            'error.message': `Required permission: ${requiredPermission}`,
            'user.id': user.id,
            'user.role': userRole,
            'required.permission': requiredPermission,
          });
          
          logger.warn({ 
            userId: user.id, 
            userRole, 
            requiredPermission, 
            userPermissions,
            url: request.url 
          }, 'Authorization failed: Insufficient permissions');
          
          return reply.status(403).send({
            error: 'Authorization Error',
            message: `Access denied. Required permission: ${requiredPermission}`,
          });
        }

        span.setAttributes({
          'authorization.success': true,
          'user.id': user.id,
          'user.role': userRole,
          'user.permission': requiredPermission,
        });

        logger.debug({ 
          userId: user.id, 
          userRole, 
          requiredPermission,
          url: request.url 
        }, 'Authorization successful: Permission check passed');

      } catch (error) {
        span.recordException(error as Error);
        logger.error({ error, url: request.url }, 'Error in permission authorization');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Authorization service error',
        });
      } finally {
        span.end();
      }
    };
  }

  /**
   * Check if user can access their own resource or has admin role
   */
  requireOwnershipOrRole(requiredRole: UserRole = UserRole.ADMIN) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const tracer = trace.getTracer(CONFIG.SERVICE_NAME);
      const span = tracer.startSpan('AuthorizationMiddleware.requireOwnershipOrRole');

      try {
        const user = (request as any).user;
        const { id: resourceId } = request.params as { id: string };
        
        if (!user) {
          span.setAttributes({
            'error.type': 'no_user',
            'error.message': 'User not authenticated',
          });
          return reply.status(401).send({
            error: 'Authentication Error',
            message: 'Authentication required',
          });
        }

        const userRole = user.role || UserRole.USER;
        const isOwner = user.id === resourceId;
        const hasRequiredRole = userRole === requiredRole;
        
        if (!isOwner && !hasRequiredRole) {
          span.setAttributes({
            'error.type': 'insufficient_access',
            'user.id': user.id,
            'user.role': userRole,
            'resource.id': resourceId,
            'is.owner': isOwner,
            'has.required.role': hasRequiredRole,
          });
          
          logger.warn({ 
            userId: user.id, 
            userRole, 
            resourceId,
            isOwner,
            hasRequiredRole,
            url: request.url 
          }, 'Authorization failed: Not owner and insufficient role');
          
          return reply.status(403).send({
            error: 'Authorization Error',
            message: 'Access denied. You can only access your own resources or need admin privileges.',
          });
        }

        span.setAttributes({
          'authorization.success': true,
          'user.id': user.id,
          'user.role': userRole,
          'resource.id': resourceId,
          'is.owner': isOwner,
          'has.required.role': hasRequiredRole,
        });

      } catch (error) {
        span.recordException(error as Error);
        logger.error({ error, url: request.url }, 'Error in ownership authorization');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Authorization service error',
        });
      } finally {
        span.end();
      }
    };
  }
}
