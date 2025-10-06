import { UpdateUserUseCase } from '../ports/UpdateUserUseCase';
import { UnitOfWork } from '../../shared/ports/UnitOfWork';
import { UserRepository } from '../../../domain/repositories/UserRepository';
import { OutboxRepository } from '../../../domain/repositories/OutboxRepository';
import { User } from '../../../domain/entities/User';
import { OutboxEvent } from '../../../domain/entities/OutboxEvent';
import { UserUpdatedEvent } from '../../../domain/events/UserEvents';
import { UpdateUserRequest, UpdateUserResponse } from '../../../shared/types';
import { NotFoundError, ConflictError, ValidationError } from '../../../shared/errors';
import { getTraceMetadata } from '../../../shared/utils';
import { DTOValidation } from '../../../shared/validation/DTOValidation';
import { CONFIG } from '../../../shared/config';
import { trace } from '@opentelemetry/api';

/**
 * Updates an existing user with proper validation and event publishing.
 * 
 * Complex Flow (more validations than create):
 * 1. Find existing user (must exist)
 * 2. Check email uniqueness (only if email is changing)
 * 3. Update only changed fields (avoids unnecessary events)
 * 4. Save user and publish events via Outbox Pattern
 * 
 * Business Rules:
 * - User must exist (404 if not found)
 * - Email must be unique across all users
 * - Only generate events for fields that actually changed
 */

export class UpdateUserUseCaseImpl implements UpdateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly unitOfWork: UnitOfWork
  ) {}

  async execute(request: UpdateUserRequest): Promise<UpdateUserResponse> {
    const tracer = trace.getTracer(CONFIG.SERVICE_NAME);
    const span = tracer.startSpan('UpdateUserUseCase.execute');
    
    try {
      // Validate request data using Zod
      const validationResult = DTOValidation.validateUpdateUserRequest(request);
      if (!validationResult.success) {
        throw new ValidationError(validationResult.error || 'Invalid request data');
      }

      const validatedRequest = validationResult.data!;
      
      span.setAttributes({
        'user.id': request.id,
        'user.email': validatedRequest.email || 'not_updated',
        'user.name': validatedRequest.name || 'not_updated',
      });

      const result = await this.unitOfWork.execute(async () => {
        // Step 1: Find existing user - throw 404 if not found
        const existingUser = await this.userRepository.findById(request.id);
        if (!existingUser) {
          throw new NotFoundError(`User with id ${request.id} not found`);
        }

        // Step 2: Email uniqueness check (only if email is changing)
        // This prevents conflicts with other users' emails
        if (validatedRequest.email && validatedRequest.email !== existingUser.email) {
          const userWithEmail = await this.userRepository.findByEmail(validatedRequest.email);
          if (userWithEmail && userWithEmail.id !== request.id) {
            throw new ConflictError(`User with email ${validatedRequest.email} already exists`);
          }
        }

        // Step 3: Update only fields that have changed
        // This follows the principle of minimal updates and accurate event generation
        // Update email only if it's provided and different from current
        if (validatedRequest.email && validatedRequest.email !== existingUser.email) {
          existingUser.updateEmail(validatedRequest.email, request.updatedBy);
        }

        // Update name only if it's provided and different from current
        if (validatedRequest.name && validatedRequest.name !== existingUser.name) {
          existingUser.updateName(validatedRequest.name, request.updatedBy);
        }

        // IMPORTANT: Preserve domain events before saving
        // The domain entity generates events when fields change
        // We need these events to create outbox events for external systems
        const domainEvents = [...existingUser.domainEvents];

        // Save updated user
        const updatedUser = await this.userRepository.save(existingUser);

        // Create outbox events for external systems from domain events
        if (domainEvents.length > 0) {
          for (const domainEvent of domainEvents) {
            const outboxEvent = OutboxEvent.create(
              'user.updated',
              {
                id: updatedUser.id,
                version: updatedUser.version,
                ...domainEvent.eventData
              },
              getTraceMetadata()
            );

            await this.outboxRepository.save(outboxEvent);
          }
        }

        return updatedUser;
      });

      span.setAttributes({
        'user.version': result.version,
        'operation.success': true,
      });

      return {
        id: result.id,
        message: 'User updated successfully',
        version: result.version,
      };
    } catch (error) {
      span.recordException(error as Error);
      span.setAttributes({
        'operation.success': false,
        'error.name': (error as Error).name,
        'error.message': (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  }
}
