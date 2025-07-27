import { DeleteUserUseCase } from '../ports/DeleteUserUseCase';
import { UnitOfWork } from '../ports/UnitOfWork';
import { UserRepository } from '../../domain/repositories/UserRepository';
import { OutboxRepository } from '../../domain/repositories/OutboxRepository';
import { User } from '../../domain/entities/User';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { DeleteUserRequest, DeleteUserResponse } from '../../shared/types';
import { NotFoundError } from '../../shared/errors';
import { getTraceMetadata } from '../../shared/utils';
import { trace } from '@opentelemetry/api';

export class DeleteUserUseCaseImpl implements DeleteUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly unitOfWork: UnitOfWork
  ) {}

  async execute(request: DeleteUserRequest): Promise<DeleteUserResponse> {
    const tracer = trace.getTracer('user-service');
    const span = tracer.startSpan('DeleteUserUseCase.execute');

    try {
      span.setAttributes({
        'user.id': request.id,
        'operation.type': 'delete_user',
      });

      const result = await this.unitOfWork.execute(async () => {
        // Find existing user
        const existingUser = await this.userRepository.findById(request.id);
        if (!existingUser) {
          throw new NotFoundError(`User with id ${request.id} not found`);
        }

        if (existingUser.isDeleted) {
          throw new NotFoundError(`User with id ${request.id} has already been deleted`);
        }

        // Delete user (soft delete with domain event)
        existingUser.delete();

        // Copy domain events before saving (as save() will clear them)
        const domainEvents = [...existingUser.domainEvents];

        // Save deleted user
        const deletedUser = await this.userRepository.save(existingUser);

        // Create outbox events for external systems from domain events
        if (domainEvents.length > 0) {
          for (const domainEvent of domainEvents) {
            const outboxEvent = OutboxEvent.create(
              `user.deleted`,
              {
                id: deletedUser.id,
                version: deletedUser.version,
                ...domainEvent.eventData
              },
              getTraceMetadata()
            );

            await this.outboxRepository.save(outboxEvent);
          }
        }

        return deletedUser;
      });

      span.setAttributes({
        'user.version': result.version,
        'operation.success': true,
      });

      return {
        id: result.id,
        message: 'User deleted successfully',
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
