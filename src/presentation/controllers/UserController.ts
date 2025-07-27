import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateUserUseCase } from '../../application/ports/CreateUserUseCase';
import { UpdateUserUseCase } from '../../application/ports/UpdateUserUseCase';
import { DeleteUserUseCase } from '../../application/ports/DeleteUserUseCase';
import { ListUsersUseCase } from '../../application/usecases/ListUsersUseCaseImpl';
import { CreateUserRequest, UpdateUserRequest, DeleteUserRequest, ListUsersRequest } from '../../shared/types';
import { ValidationError, ConflictError, NotFoundError } from '../../shared/errors';
import { trace } from '@opentelemetry/api';
import pino from 'pino';

const logger = pino({ name: 'UserController' });

export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase
  ) {}

  async listUsers(request: FastifyRequest, reply: FastifyReply) {
    const tracer = trace.getTracer('user-service');
    const span = tracer.startSpan('UserController.listUsers');

    try {
      const query = request.query as any;
      const page = query.page ? parseInt(query.page) : 1;
      const limit = query.limit ? parseInt(query.limit) : 10;

      // Validation
      if (page < 1 || limit < 1 || limit > 100) {
        span.setAttributes({
          'error.type': 'validation_error',
          'error.message': 'Invalid page or limit parameters',
        });
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Page must be >= 1 and limit must be between 1 and 100',
        });
      }

      span.setAttributes({
        'http.method': request.method,
        'http.url': request.url,
        'users.list.page': page,
        'users.list.limit': limit,
      });

      const result = await this.listUsersUseCase.execute({ page, limit });

      span.setAttributes({
        'users.list.total': result.pagination.total,
        'users.list.returned': result.users.length,
        'http.status_code': 200,
      });

      logger.info({ 
        page, 
        limit, 
        total: result.pagination.total, 
        returned: result.users.length 
      }, 'Users list retrieved');

      return reply.status(200).send(result);
    } catch (error) {
      span.recordException(error as Error);
      span.setAttributes({
        'error.type': 'internal_error',
        'http.status_code': 500,
      });
      logger.error(error, 'Internal error in users list');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    } finally {
      span.end();
    }
  }

  async createUser(request: FastifyRequest, reply: FastifyReply) {
    const tracer = trace.getTracer('user-service');
    const span = tracer.startSpan('UserController.createUser');

    try {
      const { email, name } = request.body as CreateUserRequest;

      span.setAttributes({
        'http.method': request.method,
        'http.url': request.url,
        'user.email': email,
        'user.name': name,
      });

      // Basic validation
      if (!email || !name) {
        span.setAttributes({
          'error.type': 'validation_error',
          'error.message': 'Email and name are required',
        });
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'Email and name are required',
        });
      }

      const result = await this.createUserUseCase.execute({ email, name });

      span.setAttributes({
        'user.id': result.id,
        'http.status_code': 202,
      });

      logger.info({ userId: result.id, email, name }, 'User creation initiated');

      return reply.status(202).send(result);
    } catch (error) {
      span.recordException(error as Error);
      
      if (error instanceof ValidationError) {
        span.setAttributes({
          'error.type': 'validation_error',
          'http.status_code': 400,
        });
        logger.warn({ error: error.message }, 'Validation error in user creation');
        return reply.status(400).send({
          error: 'Validation Error',
          message: error.message,
        });
      }

      if (error instanceof ConflictError) {
        span.setAttributes({
          'error.type': 'conflict_error',
          'http.status_code': 409,
        });
        logger.warn({ error: error.message }, 'Conflict error in user creation');
        return reply.status(409).send({
          error: 'Conflict Error',
          message: error.message,
        });
      }

      span.setAttributes({
        'error.type': 'internal_error',
        'http.status_code': 500,
      });
      logger.error(error, 'Internal error in user creation');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    } finally {
      span.end();
    }
  }

  async updateUser(request: FastifyRequest, reply: FastifyReply) {
    const tracer = trace.getTracer('user-service');
    const span = tracer.startSpan('UserController.updateUser');

    try {
      const { id } = request.params as { id: string };
      const { email, name } = request.body as Omit<UpdateUserRequest, 'id'>;

      span.setAttributes({
        'http.method': request.method,
        'http.url': request.url,
        'user.id': id,
        'user.email': email || 'not_updated',
        'user.name': name || 'not_updated',
      });

      // Basic validation
      if (!id) {
        span.setAttributes({
          'error.type': 'validation_error',
          'error.message': 'User ID is required',
        });
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'User ID is required',
        });
      }

      if (!email && !name) {
        span.setAttributes({
          'error.type': 'validation_error',
          'error.message': 'At least one field (email or name) must be provided',
        });
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'At least one field (email or name) must be provided',
        });
      }

      const result = await this.updateUserUseCase.execute({ id, email, name });

      span.setAttributes({
        'user.id': result.id,
        'user.version': result.version,
        'http.status_code': 200,
      });

      logger.info({ 
        userId: result.id, 
        version: result.version,
        email: email || 'not_updated',
        name: name || 'not_updated'
      }, 'User updated successfully');

      return reply.status(200).send(result);
    } catch (error) {
      span.recordException(error as Error);
      
      if (error instanceof ValidationError) {
        span.setAttributes({
          'error.type': 'validation_error',
          'http.status_code': 400,
        });
        logger.warn({ error: error.message }, 'Validation error in user update');
        return reply.status(400).send({
          error: 'Validation Error',
          message: error.message,
        });
      }

      if (error instanceof NotFoundError) {
        span.setAttributes({
          'error.type': 'not_found_error',
          'http.status_code': 404,
        });
        logger.warn({ error: error.message }, 'User not found in update');
        return reply.status(404).send({
          error: 'Not Found Error',
          message: error.message,
        });
      }

      if (error instanceof ConflictError) {
        span.setAttributes({
          'error.type': 'conflict_error',
          'http.status_code': 409,
        });
        logger.warn({ error: error.message }, 'Conflict error in user update');
        return reply.status(409).send({
          error: 'Conflict Error',
          message: error.message,
        });
      }

      span.setAttributes({
        'error.type': 'internal_error',
        'http.status_code': 500,
      });
      logger.error(error, 'Internal error in user update');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    } finally {
      span.end();
    }
  }

  async deleteUser(request: FastifyRequest, reply: FastifyReply) {
    const tracer = trace.getTracer('user-service');
    const span = tracer.startSpan('UserController.deleteUser');

    try {
      const { id } = request.params as { id: string };

      span.setAttributes({
        'http.method': request.method,
        'http.url': request.url,
        'user.id': id,
      });

      // Basic validation
      if (!id) {
        span.setAttributes({
          'error.type': 'validation_error',
          'error.message': 'User ID is required',
        });
        return reply.status(400).send({
          error: 'Validation Error',
          message: 'User ID is required',
        });
      }

      const result = await this.deleteUserUseCase.execute({ id });

      span.setAttributes({
        'user.id': result.id,
        'user.version': result.version,
        'http.status_code': 200,
      });

      logger.info({ 
        userId: result.id, 
        version: result.version
      }, 'User deleted successfully');

      return reply.status(200).send(result);
    } catch (error) {
      span.recordException(error as Error);
      
      if (error instanceof ValidationError) {
        span.setAttributes({
          'error.type': 'validation_error',
          'http.status_code': 400,
        });
        logger.warn({ error: error.message }, 'Validation error in user deletion');
        return reply.status(400).send({
          error: 'Validation Error',
          message: error.message,
        });
      }

      if (error instanceof NotFoundError) {
        span.setAttributes({
          'error.type': 'not_found_error',
          'http.status_code': 404,
        });
        logger.warn({ error: error.message }, 'User not found in deletion');
        return reply.status(404).send({
          error: 'Not Found Error',
          message: error.message,
        });
      }

      span.setAttributes({
        'error.type': 'internal_error',
        'http.status_code': 500,
      });
      logger.error(error, 'Internal error in user deletion');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    } finally {
      span.end();
    }
  }
}
