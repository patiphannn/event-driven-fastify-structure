import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './BaseController';
import { CreateUserUseCase } from '../../application/ports/CreateUserUseCase';
import { UpdateUserUseCase } from '../../application/ports/UpdateUserUseCase';
import { DeleteUserUseCase } from '../../application/ports/DeleteUserUseCase';
import { ListUsersUseCase } from '../../application/usecases/ListUsersUseCaseImpl';
import { ValidationError, NotFoundError, ConflictError } from '../../shared/errors';
import { CONFIG } from '../../shared/config';
import type { CreateUserRequest, UpdateUserRequest, DeleteUserRequest, ListUsersRequest } from '../../shared/types';

/**
 * UserController following the Clean Architecture standards
 * This controller handles all user-related HTTP operations
 */
export class UserController extends BaseController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase
  ) {
    super(CONFIG.SERVICE_NAME);
  }

  /**
   * List users with pagination
   * Demonstrates proper pagination handling and response formatting
   */
  async listUsers(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const span = this.startSpan('listUsers');

    try {
      // Extract and validate query parameters
      const query = request.query as any;
      const page = query.page ? parseInt(query.page) : 1;
      const limit = query.limit ? parseInt(query.limit) : CONFIG.PAGINATION.DEFAULT_LIMIT;

      // Validate pagination parameters
      const { page: validPage, limit: validLimit } = this.validatePagination(
        page, 
        limit, 
        CONFIG.PAGINATION.MAX_LIMIT
      );

      // Add request attributes to span
      this.addRequestAttributes(span, request.method, request.url, {
        'users.list.page': validPage,
        'users.list.limit': validLimit,
      });

      // Log operation start
      this.logOperationStart('listUsers', { page: validPage, limit: validLimit });

      // Execute use case
      const result = await this.listUsersUseCase.execute({ 
        page: validPage, 
        limit: validLimit 
      });

      // Calculate pagination metadata
      const pagination = this.calculatePagination(validPage, validLimit, result.pagination.total);

      // Add success attributes
      this.addSuccessAttributes(span, 200, {
        'users.list.total': result.pagination.total,
        'users.list.returned': result.users.length,
      });

      // Log success
      this.logOperationSuccess('listUsers', { 
        total: result.pagination.total, 
        returned: result.users.length 
      });

      // Return paginated response
      return this.paginatedResponse(reply, result.users, pagination);

    } catch (error) {
      return this.errorHandler.handle(error, request, reply, span);
    } finally {
      span.end();
    }
  }

  /**
   * Create a new user
   * Demonstrates async operation with 202 Accepted response
   */
  async createUser(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const span = this.startSpan('createUser');

    try {
      // Extract and validate request body
      const { email, name } = request.body as CreateUserRequest;
      
      // Basic validation (additional validation in use case)
      if (!email || !name) {
        throw new ValidationError('Email and name are required', { 
          missingFields: { email: !email, name: !name } 
        });
      }

      // Get authenticated user from middleware
      const authenticatedUser = (request as any).user || null;

      // Add request attributes to span
      this.addRequestAttributes(span, request.method, request.url, {
        'user.email': email,
        'user.name': name,
        'user.hasCreator': !!authenticatedUser,
      });

      // Log operation start
      this.logOperationStart('createUser', { 
        email, 
        name, 
        createdBy: authenticatedUser?.email || 'anonymous' 
      });

      // Execute use case
      const result = await this.createUserUseCase.execute({ 
        email, 
        name,
        createdBy: authenticatedUser ? {
          id: authenticatedUser.id,
          name: authenticatedUser.name,
          email: authenticatedUser.email
        } : undefined
      });

      // Add success attributes
      this.addSuccessAttributes(span, 202, {
        'user.id': result.id,
      });

      // Log success
      this.logOperationSuccess('createUser', { 
        userId: result.id, 
        email, 
        name 
      });

      // Return accepted response (async operation)
      return this.acceptedResponse(reply, result, {
        message: 'User creation initiated',
        estimatedCompletionTime: '< 1 second'
      });

    } catch (error) {
      return this.errorHandler.handle(error, request, reply, span);
    } finally {
      span.end();
    }
  }

  /**
   * Update an existing user
   * Demonstrates proper error handling and validation
   */
  async updateUser(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const span = this.startSpan('updateUser');

    try {
      // Extract parameters and body
      const { id } = request.params as { id: string };
      const { email, name } = request.body as Omit<UpdateUserRequest, 'id'>;
      const currentUser = (request as any).user;

      // Basic validation
      if (!id) {
        throw new ValidationError('User ID is required', { parameter: 'id' });
      }

      if (!email && !name) {
        throw new ValidationError('At least one field (email or name) must be provided', {
          providedFields: { email: !!email, name: !!name }
        });
      }

      // Add request attributes to span
      this.addRequestAttributes(span, request.method, request.url, {
        'user.id': id,
        'user.email': email || 'not_updated',
        'user.name': name || 'not_updated',
        'updated_by.id': currentUser?.id || 'unknown',
      });

      // Log operation start
      this.logOperationStart('updateUser', { 
        userId: id, 
        email: email || 'not_updated',
        name: name || 'not_updated',
        updatedBy: currentUser?.email || 'unknown'
      });

      // Execute use case
      const result = await this.updateUserUseCase.execute({ 
        id, 
        email, 
        name, 
        updatedBy: currentUser 
      });

      // Add success attributes
      this.addSuccessAttributes(span, 200, {
        'user.id': result.id,
        'user.version': result.version,
      });

      // Log success
      this.logOperationSuccess('updateUser', { 
        userId: result.id, 
        version: result.version 
      });

      // Return success response
      return this.successResponse(reply, result, 200, {
        version: result.version.toString()
      });

    } catch (error) {
      return this.errorHandler.handle(error, request, reply, span);
    } finally {
      span.end();
    }
  }

  /**
   * Delete a user (soft delete)
   * Demonstrates proper deletion handling
   */
  async deleteUser(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const span = this.startSpan('deleteUser');

    try {
      // Extract parameters
      const { id } = request.params as { id: string };
      const currentUser = (request as any).user;

      // Basic validation
      if (!id) {
        throw new ValidationError('User ID is required', { parameter: 'id' });
      }

      // Add request attributes to span
      this.addRequestAttributes(span, request.method, request.url, {
        'user.id': id,
        'deleted_by.id': currentUser?.id || 'unknown',
      });

      // Log operation start
      this.logOperationStart('deleteUser', { 
        userId: id, 
        deletedBy: currentUser?.email || 'unknown'
      });

      // Execute use case
      const result = await this.deleteUserUseCase.execute({ 
        id, 
        deletedBy: currentUser 
      });

      // Add success attributes
      this.addSuccessAttributes(span, 200, {
        'user.id': result.id,
        'user.version': result.version,
      });

      // Log success
      this.logOperationSuccess('deleteUser', { 
        userId: result.id, 
        version: result.version 
      });

      // Return success response
      return this.successResponse(reply, result, 200, {
        version: result.version.toString()
      });

    } catch (error) {
      return this.errorHandler.handle(error, request, reply, span);
    } finally {
      span.end();
    }
  }
}