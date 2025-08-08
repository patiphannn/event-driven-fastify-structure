import { DeleteUserUseCaseImpl } from '../../application/usecases/DeleteUserUseCaseImpl';
import { UserRepository } from '../../domain/repositories/UserRepository';
import { OutboxRepository } from '../../domain/repositories/OutboxRepository';
import { UnitOfWork } from '../../application/ports/UnitOfWork';
import { User } from '../../domain/entities/User';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { NotFoundError } from '../../shared/errors';

// Mock dependencies
const mockUserRepository: jest.Mocked<UserRepository> = {
  save: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  findMany: jest.fn(),
};

const mockOutboxRepository: jest.Mocked<OutboxRepository> = {
  save: jest.fn(),
  findUnprocessed: jest.fn(),
  markAsProcessed: jest.fn(),
};

const mockUnitOfWork: jest.Mocked<UnitOfWork> = {
  execute: jest.fn(),
};

describe('DeleteUserUseCaseImpl', () => {
  let deleteUserUseCase: DeleteUserUseCaseImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    deleteUserUseCase = new DeleteUserUseCaseImpl(
      mockUserRepository,
      mockOutboxRepository,
      mockUnitOfWork
    );

    // Mock UnitOfWork to execute the callback
    mockUnitOfWork.execute.mockImplementation(async (callback) => {
      return await callback();
    });
  });

  const mockTraceMetadata = {
    traceId: 'test-trace-id',
    spanId: 'test-span-id',
  };

  const existingUser = User.create('existing@example.com', 'Existing User');
  const validRequest = {
    id: existingUser.id,
  };

  describe('execute', () => {
    it('should delete a user successfully', async () => {
      const mockOutboxEvent = OutboxEvent.create('user.deleted', { id: existingUser.id }, mockTraceMetadata);
      
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.save.mockResolvedValue(existingUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      const result = await deleteUserUseCase.execute(validRequest);

      expect(result).toEqual({
        id: existingUser.id,
        message: 'User deleted successfully',
        version: existingUser.version,
      });

      expect(mockUserRepository.findById).toHaveBeenCalledWith(validRequest.id);
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockOutboxRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundError if user does not exist', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(deleteUserUseCase.execute(validRequest)).rejects.toThrow(NotFoundError);

      expect(mockUserRepository.findById).toHaveBeenCalledWith(validRequest.id);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockOutboxRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError if user is already deleted', async () => {
      existingUser.delete(); // Mark as deleted
      mockUserRepository.findById.mockResolvedValue(existingUser);

      await expect(deleteUserUseCase.execute(validRequest)).rejects.toThrow(NotFoundError);

      expect(mockUserRepository.findById).toHaveBeenCalledWith(validRequest.id);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockOutboxRepository.save).not.toHaveBeenCalled();
    });

    it('should create outbox event with correct data', async () => {
      const freshUser = User.create('fresh@example.com', 'Fresh User');
      const mockOutboxEvent = OutboxEvent.create('user.deleted', { id: freshUser.id }, mockTraceMetadata);
      
      mockUserRepository.findById.mockResolvedValue(freshUser);
      mockUserRepository.save.mockResolvedValue(freshUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      await deleteUserUseCase.execute({ id: freshUser.id });

      expect(mockOutboxRepository.save).toHaveBeenCalled();
      const outboxEvent = mockOutboxRepository.save.mock.calls[0][0];
      expect(outboxEvent.eventType).toBe('user.deleted');
      expect(outboxEvent.eventData).toMatchObject({
        id: freshUser.id,
        version: freshUser.version,
      });
    });

    it('should set deletedAt timestamp when deleting', async () => {
      const freshUser = User.create('fresh@example.com', 'Fresh User');
      const mockOutboxEvent = OutboxEvent.create('user.deleted', { id: freshUser.id }, mockTraceMetadata);
      
      mockUserRepository.findById.mockResolvedValue(freshUser);
      mockUserRepository.save.mockImplementation((user) => {
        expect(user.isDeleted).toBe(true);
        expect(user.deletedAt).toBeInstanceOf(Date);
        return Promise.resolve(user);
      });
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      await deleteUserUseCase.execute({ id: freshUser.id });

      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should execute within unit of work', async () => {
      const freshUser = User.create('fresh@example.com', 'Fresh User');
      const mockOutboxEvent = OutboxEvent.create('user.deleted', { id: freshUser.id }, mockTraceMetadata);
      
      mockUserRepository.findById.mockResolvedValue(freshUser);
      mockUserRepository.save.mockResolvedValue(freshUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      await deleteUserUseCase.execute({ id: freshUser.id });

      expect(mockUnitOfWork.execute).toHaveBeenCalled();
    });
  });
});
