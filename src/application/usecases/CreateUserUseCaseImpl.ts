import { CreateUserUseCase } from '../ports/CreateUserUseCase';
import { UnitOfWork } from '../ports/UnitOfWork';
import { UserRepository } from '../../domain/repositories/UserRepository';
import { OutboxRepository } from '../../domain/repositories/OutboxRepository';
import { User } from '../../domain/entities/User';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { CreateUserRequest, CreateUserResponse } from '../../shared/types';
import { ConflictError, ValidationError } from '../../shared/errors';
import { getTraceMetadata } from '../../shared/utils';
import { CONFIG } from '../../shared/config';
import { trace } from '@opentelemetry/api';

/**
 * Creates a new user following the Outbox Pattern for event publishing.
 * 
 * Flow:
 * 1. Check if user with email already exists (business rule)
 * 2. Create new User domain entity 
 * 3. Save user to database within transaction
 * 4. Create outbox events for external systems (async event publishing)
 * 
 * Why Outbox Pattern?
 * - Ensures data consistency between user creation and event publishing
 * - If user creation fails, no events are published
 * - Events are processed by background job later
 */

export class CreateUserUseCaseImpl implements CreateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly unitOfWork: UnitOfWork
  ) {}

  async execute(request: CreateUserRequest): Promise<CreateUserResponse> {
    const tracer = trace.getTracer(CONFIG.SERVICE_NAME);
    const span = tracer.startSpan('CreateUserUseCase.execute');
    
    try {
      span.setAttributes({
        'user.email': request.email,
        'user.name': request.name,
      });

      // Execute everything in a database transaction to ensure consistency
      // If any step fails, all changes are rolled back
      const result = await this.unitOfWork.execute(async () => {
        // Check if user already exists
        const existingUser = await this.userRepository.findByEmail(request.email);
        if (existingUser) {
          throw new ConflictError(`User with email ${request.email} already exists`);
        }

        // Create new user - this generates domain events automatically
        const user = User.create(request.email, request.name, request.createdBy);
        
        // IMPORTANT: Copy domain events before saving 
        // The save() method clears domain events, so we need to preserve them
        // for creating outbox events afterwards
        const domainEvents = [...user.domainEvents];
        
        const savedUser = await this.userRepository.save(user);

        // Create outbox events for external systems notification
        // This implements the Outbox Pattern - events are stored in same transaction
        // and will be processed by background worker later
        if (domainEvents.length > 0) {
          for (const domainEvent of domainEvents) {
            // Create external event for message bus/other services
            const outboxEvent = OutboxEvent.create(
              'user.created',
              {
                id: savedUser.id,
                ...domainEvent.eventData
              },
              getTraceMetadata()
            );

            await this.outboxRepository.save(outboxEvent);
          }
        }

        return savedUser;
      });

      span.setAttributes({
        'user.id': result.id,
        'operation.success': true,
      });

      return {
        id: result.id,
        message: 'User creation initiated successfully',
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
