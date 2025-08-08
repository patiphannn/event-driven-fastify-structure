import { UpdateUserUseCaseImpl } from '../../application/usecases/UpdateUserUseCaseImpl';
import { UserRepository } from '../../domain/repositories/UserRepository';
import { OutboxRepository } from '../../domain/repositories/OutboxRepository';
import { UnitOfWork } from '../../application/ports/UnitOfWork';
import { User } from '../../domain/entities/User';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { NotFoundError, ConflictError } from '../../shared/errors';

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

describe('UpdateUserUseCaseImpl', () => {
  let updateUserUseCase: UpdateUserUseCaseImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    updateUserUseCase = new UpdateUserUseCaseImpl(
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
    name: 'Updated Name',
    email: 'updated@example.com',
  };

  describe('execute', () => {
    it('should update a user successfully', async () => {
      const mockOutboxEvent = OutboxEvent.create('user.updated', { id: existingUser.id }, mockTraceMetadata);
      
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue(existingUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      const result = await updateUserUseCase.execute(validRequest);

      expect(result).toEqual({
        id: existingUser.id,
        message: 'User updated successfully',
        version: existingUser.version,
      });

      expect(mockUserRepository.findById).toHaveBeenCalledWith(validRequest.id);
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockOutboxRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundError if user does not exist', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(updateUserUseCase.execute(validRequest)).rejects.toThrow(NotFoundError);

      expect(mockUserRepository.findById).toHaveBeenCalledWith(validRequest.id);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockOutboxRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ConflictError if email already exists for another user', async () => {
      // Create fresh users for this test to avoid shared state issues
      const testExistingUser = User.create('existing@example.com', 'Existing User');
      const testValidRequest = {
        id: testExistingUser.id,
        name: 'Updated Name',
        email: 'updated@example.com',
      };
      const anotherUser = User.create('updated@example.com', 'Another User');
      
      mockUserRepository.findById.mockResolvedValue(testExistingUser);
      mockUserRepository.findByEmail.mockResolvedValue(anotherUser);

      await expect(updateUserUseCase.execute(testValidRequest)).rejects.toThrow(ConflictError);

      expect(mockUserRepository.findById).toHaveBeenCalledWith(testValidRequest.id);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(testValidRequest.email);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockOutboxRepository.save).not.toHaveBeenCalled();
    });

    it('should allow updating email to the same email', async () => {
      const requestWithSameEmail = {
        id: existingUser.id,
        name: 'Updated Name',
        email: existingUser.email,
      };
      const mockOutboxEvent = OutboxEvent.create('user.updated', { id: existingUser.id }, mockTraceMetadata);
      
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.save.mockResolvedValue(existingUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      const result = await updateUserUseCase.execute(requestWithSameEmail);

      expect(result).toEqual({
        id: existingUser.id,
        message: 'User updated successfully',
        version: existingUser.version,
      });

      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('should create outbox event with correct data', async () => {
      const mockOutboxEvent = OutboxEvent.create('user.updated', { id: existingUser.id }, mockTraceMetadata);
      
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue(existingUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      await updateUserUseCase.execute(validRequest);

      expect(mockOutboxRepository.save).toHaveBeenCalled();
      const outboxEvent = mockOutboxRepository.save.mock.calls[0][0];
      expect(outboxEvent.eventType).toBe('user.updated');
      expect(outboxEvent.eventData).toMatchObject({
        id: existingUser.id,
        version: existingUser.version,
      });
    });

    it('should update only name if email is not provided', async () => {
      const requestWithNameOnly = {
        id: existingUser.id,
        name: 'New Name Only',
      };
      const mockOutboxEvent = OutboxEvent.create('user.updated', { id: existingUser.id }, mockTraceMetadata);
      
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.save.mockResolvedValue(existingUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      await updateUserUseCase.execute(requestWithNameOnly);

      expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should execute within unit of work', async () => {
      const mockOutboxEvent = OutboxEvent.create('user.updated', { id: existingUser.id }, mockTraceMetadata);
      
      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue(existingUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      await updateUserUseCase.execute(validRequest);

      expect(mockUnitOfWork.execute).toHaveBeenCalled();
    });
  });
});
