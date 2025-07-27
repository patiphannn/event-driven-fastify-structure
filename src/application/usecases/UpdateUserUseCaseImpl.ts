import { UpdateUserUseCase } from '../ports/UpdateUserUseCase';
import { UnitOfWork } from '../ports/UnitOfWork';
import { UserRepository } from '../../domain/repositories/UserRepository';
import { OutboxRepository } from '../../domain/repositories/OutboxRepository';
import { User } from '../../domain/entities/User';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { UserUpdatedEvent } from '../../domain/events/UserEvents';
import { UpdateUserRequest, UpdateUserResponse } from '../../shared/types';
import { NotFoundError, ConflictError } from '../../shared/errors';
import { getTraceMetadata } from '../../shared/utils';
import { trace } from '@opentelemetry/api';

export class UpdateUserUseCaseImpl implements UpdateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly unitOfWork: UnitOfWork
  ) {}

  async execute(request: UpdateUserRequest): Promise<UpdateUserResponse> {
    const tracer = trace.getTracer('user-service');
    const span = tracer.startSpan('UpdateUserUseCase.execute');
    
    try {
      span.setAttributes({
        'user.id': request.id,
        'user.email': request.email || 'not_updated',
        'user.name': request.name || 'not_updated',
      });

      const result = await this.unitOfWork.execute(async () => {
        // Find existing user
        const existingUser = await this.userRepository.findById(request.id);
        if (!existingUser) {
          throw new NotFoundError(`User with id ${request.id} not found`);
        }

        // Check for email conflicts (if email is being updated)
        if (request.email && request.email !== existingUser.email) {
          const userWithEmail = await this.userRepository.findByEmail(request.email);
          if (userWithEmail && userWithEmail.id !== request.id) {
            throw new ConflictError(`User with email ${request.email} already exists`);
          }
        }

        // Update user fields
        if (request.email && request.email !== existingUser.email) {
          existingUser.updateEmail(request.email);
        }

        if (request.name && request.name !== existingUser.name) {
          existingUser.updateName(request.name);
        }

        // Copy domain events before saving (as save() will clear them)
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
