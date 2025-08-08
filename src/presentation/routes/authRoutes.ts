import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/AuthController';
import { AuthMiddleware } from '../middleware/AuthMiddleware';

export const registerAuthRoutes = (fastify: FastifyInstance, authController: AuthController, authMiddleware: AuthMiddleware) => {
  // POST /auth/login - User login
  fastify.post('/auth/login', {
    schema: {
      tags: ['Authentication'],
      summary: 'User login',
      description: 'Authenticate user with email and password, returns JWT token',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
          },
          password: {
            type: 'string',
            minLength: 1,
            description: 'User password',
          },
        },
      },
      response: {
        200: {
          description: 'Login successful',
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Success message',
            },
            token: {
              type: 'string',
              description: 'JWT authentication token',
            },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
              },
            },
            expiresIn: {
              type: 'string',
              description: 'Token expiration time',
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
          description: 'Authentication failed',
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
    handler: authController.login.bind(authController),
  });

  // GET /auth/profile - Get user profile (protected route)
  fastify.get('/auth/profile', {
    preHandler: [authMiddleware.authenticate.bind(authMiddleware)],
    schema: {
      tags: ['Authentication'],
      summary: 'Get user profile',
      description: 'Get current authenticated user profile information',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'User profile retrieved successfully',
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
              },
            },
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
    handler: authController.getProfile.bind(authController),
  });

  // GET /auth/mock-users - Get list of mock users for testing (development only)
  if (process.env.NODE_ENV === 'development') {
    fastify.get('/auth/mock-users', {
      schema: {
        tags: ['Authentication'],
        summary: 'Get mock users (development only)',
        description: 'Get list of available mock users for testing login functionality',
        response: {
          200: {
            description: 'Mock users list',
            type: 'object',
            properties: {
              users: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    email: { type: 'string' },
                    name: { type: 'string' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      handler: async (request, reply) => {
        const mockUsers = [
          { email: 'admin@example.com', name: 'Admin User', password: 'admin123' },
          { email: 'user@example.com', name: 'Regular User', password: 'user123' },
          { email: 'test@example.com', name: 'Test User', password: 'test123' },
        ];

        return reply.status(200).send({
          users: mockUsers,
          note: 'These are mock users for development testing only',
        });
      },
    });
  }
};
