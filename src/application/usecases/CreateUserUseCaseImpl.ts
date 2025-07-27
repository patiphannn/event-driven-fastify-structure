import { CreateUserUseCase } from '../ports/CreateUserUseCase';
import { UnitOfWork } from '../ports/UnitOfWork';
import { UserRepository } from '../../domain/repositories/UserRepository';
import { OutboxRepository } from '../../domain/repositories/OutboxRepository';
import { User } from '../../domain/entities/User';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { CreateUserRequest, CreateUserResponse } from '../../shared/types';
import { ConflictError } from '../../shared/errors';
import { getTraceMetadata } from '../../shared/utils';
import { trace } from '@opentelemetry/api';

export class CreateUserUseCaseImpl implements CreateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly unitOfWork: UnitOfWork
  ) {}

  async execute(request: CreateUserRequest): Promise<CreateUserResponse> {
    const tracer = trace.getTracer('user-service');
    const span = tracer.startSpan('CreateUserUseCase.execute');
    
    try {
      span.setAttributes({
        'user.email': request.email,
        'user.name': request.name,
      });

      const result = await this.unitOfWork.execute(async () => {
        // Check if user already exists
        const existingUser = await this.userRepository.findByEmail(request.email);
        if (existingUser) {
          throw new ConflictError(`User with email ${request.email} already exists`);
        }

        // Create new user
        const user = User.create(request.email, request.name);
        
        // Copy domain events before saving (as save() will clear them)
        const domainEvents = [...user.domainEvents];
        
        const savedUser = await this.userRepository.save(user);

        // Create outbox events for external systems from domain events
        if (domainEvents.length > 0) {
          for (const domainEvent of domainEvents) {
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
