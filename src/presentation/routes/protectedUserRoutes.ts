import { FastifyInstance } from 'fastify';
import { UserController } from '../controllers/UserController';
import { AuthMiddleware } from '../middleware/AuthMiddleware';
import { AuthorizationMiddleware } from '../middleware/AuthorizationMiddleware';
import { UserRole, Permission, RolePermissions } from '../../shared/types/Role';

export const registerProtectedUserRoutes = (
  fastify: FastifyInstance, 
  userController: UserController, 
  authMiddleware: AuthMiddleware,
  authorizationMiddleware: AuthorizationMiddleware
) => {
  
  // 1. Admin-only route: List all users
  fastify.get('/admin/users', {
    preHandler: [
      authMiddleware.authenticate.bind(authMiddleware),
      authorizationMiddleware.requireRole(UserRole.ADMIN)
    ],
    schema: {
      tags: ['Admin'],
      summary: 'List all users (Admin only)',
      description: 'Get paginated list of all users. Requires admin role.',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        },
      },
      response: {
        200: { description: 'Users retrieved successfully' },
        401: { description: 'Authentication required' },
        403: { description: 'Admin access required' },
        500: { description: 'Internal server error' },
      },
    },
    handler: userController.listUsers.bind(userController),
  });

  // 2. Permission-based route: Create user
  fastify.post('/users', {
    preHandler: [
      authMiddleware.authenticate.bind(authMiddleware),
      authorizationMiddleware.requirePermission(Permission.CREATE_USER)
    ],
    schema: {
      tags: ['Users'],
      summary: 'Create user (requires permission)',
      description: 'Create a new user. Requires CREATE_USER permission.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['email', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 2, maxLength: 100 },
        },
      },
      response: {
        202: { description: 'User creation initiated' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Insufficient permissions' },
        409: { description: 'User already exists' },
        500: { description: 'Internal server error' },
      },
    },
    handler: userController.createUser.bind(userController),
  });

  // 3. Ownership or admin route: Update user
  fastify.put('/users/:id', {
    preHandler: [
      authMiddleware.authenticate.bind(authMiddleware),
      authorizationMiddleware.requireOwnershipOrRole(UserRole.ADMIN)
    ],
    schema: {
      tags: ['Users'],
      summary: 'Update user (own resource or admin)',
      description: 'Update user information. Users can update their own data, admins can update any user.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User ID' },
        },
      },
      body: {
        type: 'object',
        minProperties: 1,
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 2, maxLength: 100 },
        },
      },
      response: {
        200: { description: 'User updated successfully' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Access denied - not owner or admin' },
        404: { description: 'User not found' },
        409: { description: 'Email already exists' },
        500: { description: 'Internal server error' },
      },
    },
    handler: userController.updateUser.bind(userController),
  });

  // 4. Multiple role route: Delete user
  fastify.delete('/users/:id', {
    preHandler: [
      authMiddleware.authenticate.bind(authMiddleware),
      authorizationMiddleware.requirePermission(Permission.DELETE_USER)
    ],
    schema: {
      tags: ['Users'],
      summary: 'Delete user (admin or moderator)',
      description: 'Soft delete a user. Requires DELETE_USER permission (admin or moderator).',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User ID to delete' },
        },
      },
      response: {
        200: { description: 'User deleted successfully' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Insufficient permissions' },
        404: { description: 'User not found or already deleted' },
        500: { description: 'Internal server error' },
      },
    },
    handler: userController.deleteUser.bind(userController),
  });

  // 5. Public read access: Get user profile
  fastify.get('/users/:id', {
    preHandler: [
      authMiddleware.optionalAuth.bind(authMiddleware), // Optional auth
    ],
    schema: {
      tags: ['Users'],
      summary: 'Get user profile (public read)',
      description: 'Get user profile information. Public access with optional authentication.',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User ID' },
        },
      },
      response: {
        200: { description: 'User profile retrieved' },
        404: { description: 'User not found' },
        500: { description: 'Internal server error' },
      },
    },
    handler: async (request, reply) => {
      // Custom handler with optional permission checking
      const user = (request as any).user;
      const { id } = request.params as { id: string };
      
      // Users can see full details of their own profile
      // Others see limited public information
      if (user && user.id === id) {
        // Return full profile - reuse existing listUsers logic
        return reply.status(200).send({ message: 'Full profile access', userId: id });
      } else {
        // Return limited public profile
        return reply.status(200).send({ message: 'Public profile access', userId: id });
      }
    },
  });

  // 6. Helper route: Check user permissions
  fastify.get('/auth/permissions', {
    preHandler: [authMiddleware.authenticate.bind(authMiddleware)],
    schema: {
      tags: ['Authentication'],
      summary: 'Get user permissions',
      description: 'Get current user role and permissions',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'User permissions retrieved',
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                role: { type: 'string' },
              },
            },
            permissions: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        401: { description: 'Authentication required' },
        500: { description: 'Internal server error' },
      },
    },
    handler: async (request, reply) => {
      const user = (request as any).user;
      const userRole = user.role as UserRole || UserRole.USER;
      const permissions = RolePermissions[userRole] || [];

      return reply.status(200).send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: userRole,
        },
        permissions,
      });
    },
  });
};
