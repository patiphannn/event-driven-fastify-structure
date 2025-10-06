import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ValidationError } from '../errors';

/**
 * Zod Validation Middleware for Fastify
 * 
 * This middleware validates request data (body, params, query) against Zod schemas
 * and automatically returns validation errors with proper HTTP status codes.
 */

export interface ValidationSchemas {
  body?: z.ZodSchema;
  params?: z.ZodSchema;
  query?: z.ZodSchema;
}

/**
 * Creates a validation middleware function for Fastify routes
 * 
 * @param schemas - Object containing Zod schemas for body, params, and/or query
 * @returns Fastify middleware function
 */
export function createValidationMiddleware(schemas: ValidationSchemas) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate request body
      if (schemas.body) {
        const bodyValidation = schemas.body.safeParse(request.body);
        if (!bodyValidation.success) {
          const errors = bodyValidation.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          }));
          
          return reply.status(400).send({
            error: 'Validation Error',
            message: 'Request body validation failed',
            details: errors,
          });
        }
        
        // Replace request.body with validated and transformed data
        request.body = bodyValidation.data;
      }

      // Validate request params
      if (schemas.params) {
        const paramsValidation = schemas.params.safeParse(request.params);
        if (!paramsValidation.success) {
          const errors = paramsValidation.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          }));
          
          return reply.status(400).send({
            error: 'Validation Error',
            message: 'Request params validation failed',
            details: errors,
          });
        }
        
        // Replace request.params with validated data
        request.params = paramsValidation.data;
      }

      // Validate request query
      if (schemas.query) {
        const queryValidation = schemas.query.safeParse(request.query);
        if (!queryValidation.success) {
          const errors = queryValidation.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          }));
          
          return reply.status(400).send({
            error: 'Validation Error',
            message: 'Request query validation failed',
            details: errors,
          });
        }
        
        // Replace request.query with validated data
        request.query = queryValidation.data;
      }

    } catch (error) {
      // Handle unexpected validation errors
      request.log.error({ error }, 'Validation middleware error');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Validation middleware encountered an error',
      });
    }
  };
}

/**
 * Pre-built validation middleware for common User API endpoints
 */
export class UserValidationMiddleware {
  
  /**
   * Middleware for POST /users (Create User)
   */
  static createUser() {
    return createValidationMiddleware({
      body: z.object({
        email: z.string().email().min(1).max(255).transform(val => val.toLowerCase().trim()),
        name: z.string().min(2).max(100).transform(val => val.trim()),
      }),
    });
  }

  /**
   * Middleware for PUT /users/:id (Update User)
   */
  static updateUser() {
    return createValidationMiddleware({
      params: z.object({
        id: z.string().uuid(),
      }),
      body: z.object({
        email: z.string().email().min(1).max(255).transform(val => val.toLowerCase().trim()).optional(),
        name: z.string().min(2).max(100).transform(val => val.trim()).optional(),
      }).refine(
        data => data.email !== undefined || data.name !== undefined,
        { message: 'At least one field (email or name) must be provided for update' }
      ),
    });
  }

  /**
   * Middleware for DELETE /users/:id (Delete User)
   */
  static deleteUser() {
    return createValidationMiddleware({
      params: z.object({
        id: z.string().uuid(),
      }),
    });
  }

  /**
   * Middleware for GET /users/:id (Get User by ID)
   */
  static getUserById() {
    return createValidationMiddleware({
      params: z.object({
        id: z.string().uuid(),
      }),
    });
  }

  /**
   * Middleware for GET /users (List Users)
   */
  static listUsers() {
    return createValidationMiddleware({
      query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(10),
      }),
    });
  }
}

/**
 * Helper function to create a simple validation error response
 */
export function createValidationErrorResponse(message: string, details?: any) {
  return {
    error: 'Validation Error',
    message,
    details,
  };
}