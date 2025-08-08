import { FastifyInstance } from 'fastify';
import { UserController } from '../controllers/UserController';
import { AuthMiddleware } from '../middleware/AuthMiddleware';

export const registerUserRoutes = (fastify: FastifyInstance, userController: UserController, authMiddleware: AuthMiddleware) => {
  // POST /users - Create a new user
  fastify.post('/users', {
    preHandler: [authMiddleware.optionalAuth.bind(authMiddleware)],
    schema: {
      tags: ['Users'],
      summary: 'Create a new user',
      description: 'Creates a new user account asynchronously. Returns 202 Accepted with user ID while processing continues in the background. Optional authentication tracks creator.',
      body: {
        type: 'object',
        required: ['email', 'name'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
          },
          name: {
            type: 'string',
            minLength: 2,
            maxLength: 100,
            description: 'User full name',
          },
        },
      },
      response: {
        202: {
          description: 'User creation initiated successfully',
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Generated user ID',
            },
            message: {
              type: 'string',
              description: 'Success message',
            },
          },
        },
        400: {
          description: 'Validation error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        409: {
          description: 'Conflict error (email already exists)',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, userController.createUser.bind(userController));

  // GET /users - List users with pagination
  fastify.get('/users', {
    schema: {
      tags: ['Users'],
      summary: 'List users with pagination',
      description: 'Retrieves a paginated list of users. Results are cached in Redis for improved performance.',
      querystring: {
        type: 'object',
        properties: {
          page: {
            type: 'string',
            pattern: '^[1-9]\\d*$',
            description: 'Page number (minimum 1)',
          },
          limit: {
            type: 'string', 
            pattern: '^([1-9]|[1-9]\\d|100)$',
            description: 'Items per page (1-100)',
          },
        },
      },
      response: {
        200: {
          description: 'List of users with pagination metadata',
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'User ID',
                  },
                  email: {
                    type: 'string',
                    format: 'email',
                    description: 'User email address',
                  },
                  name: {
                    type: 'string',
                    description: 'User full name',
                  },
                  createdAt: {
                    type: 'string',
                    format: 'date-time',
                    description: 'User creation timestamp',
                  },
                  updatedAt: {
                    type: 'string',
                    format: 'date-time',
                    description: 'User last update timestamp',
                  },
                  createdBy: { 
                    type: 'object',
                    additionalProperties: true,
                    description: 'User who created this account',
                  },
                  updatedBy: { 
                    type: 'object',
                    additionalProperties: true,
                    description: 'User who last updated this account',
                  },
                  deletedBy: { 
                    type: 'object',
                    additionalProperties: true,
                    description: 'User who deleted this account',
                  },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Current page number',
                },
                limit: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 100,
                  description: 'Items per page',
                },
                total: {
                  type: 'integer',
                  minimum: 0,
                  description: 'Total number of items',
                },
                totalPages: {
                  type: 'integer',
                  minimum: 0,
                  description: 'Total number of pages',
                },
              },
            },
          },
        },
        400: {
          description: 'Validation error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, userController.listUsers.bind(userController));

  // PUT /users/:id - Update a user
  fastify.put('/users/:id', {
    preHandler: [authMiddleware.authenticate.bind(authMiddleware)],
    schema: {
      tags: ['Users'],
      summary: 'Update user information',
      description: 'Updates user email and/or name. At least one field must be provided. Returns updated user information.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'User ID to update',
          },
        },
      },
      body: {
        type: 'object',
        minProperties: 1,
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'New user email address',
          },
          name: {
            type: 'string',
            minLength: 2,
            maxLength: 100,
            description: 'New user full name',
          },
        },
      },
      response: {
        200: {
          description: 'User updated successfully',
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'User ID',
            },
            message: {
              type: 'string',
              description: 'Success message',
            },
            version: {
              type: 'integer',
              description: 'User version number',
            },
          },
        },
        400: {
          description: 'Validation error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        401: {
          description: 'Authentication required',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        404: {
          description: 'User not found',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        409: {
          description: 'Conflict error (email already exists)',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, userController.updateUser.bind(userController));

  // DELETE /users/:id - Delete a user
  fastify.delete('/users/:id', {
    preHandler: [authMiddleware.authenticate.bind(authMiddleware)],
    schema: {
      tags: ['Users'],
      summary: 'Delete a user',
      description: 'Soft deletes a user account. The user will be marked as deleted but data is preserved for audit purposes.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'User ID to delete',
          },
        },
      },
      response: {
        200: {
          description: 'User deleted successfully',
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'User ID',
            },
            message: {
              type: 'string',
              description: 'Success message',
            },
            version: {
              type: 'integer',
              description: 'User version number',
            },
          },
        },
        400: {
          description: 'Validation error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        401: {
          description: 'Authentication required',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        404: {
          description: 'User not found or already deleted',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, userController.deleteUser.bind(userController));

  // Health check endpoint
  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Health check',
      description: 'Returns the service health status and current timestamp',
      response: {
        200: {
          description: 'Service is healthy',
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['ok'],
              description: 'Service status',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Current timestamp',
            },
          },
        },
      },
    },
  }, async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
};
