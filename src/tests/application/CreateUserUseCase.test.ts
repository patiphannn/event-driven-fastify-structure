import { CreateUserUseCaseImpl } from '../../application/usecases/CreateUserUseCaseImpl';
import { UserRepository } from '../../domain/repositories/UserRepository';
import { OutboxRepository } from '../../domain/repositories/OutboxRepository';
import { UnitOfWork } from '../../application/ports/UnitOfWork';
import { User } from '../../domain/entities/User';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { ConflictError } from '../../shared/errors';

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

describe('CreateUserUseCaseImpl', () => {
  let createUserUseCase: CreateUserUseCaseImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    createUserUseCase = new CreateUserUseCaseImpl(
      mockUserRepository,
      mockOutboxRepository,
      mockUnitOfWork
    );

    // Mock UnitOfWork to execute the callback
    mockUnitOfWork.execute.mockImplementation(async (callback) => {
      return await callback();
    });
  });

  const validRequest = {
    email: 'test@example.com',
    name: 'Test User',
  };

  const mockTraceMetadata = {
    traceId: 'test-trace-id',
    spanId: 'test-span-id',
  };

  describe('execute', () => {
    it('should create a user successfully', async () => {
      const mockUser = User.create(validRequest.email, validRequest.name);
      const mockOutboxEvent = OutboxEvent.create('user.created', { id: mockUser.id }, mockTraceMetadata);
      
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      const result = await createUserUseCase.execute(validRequest);

      expect(result).toEqual({
        id: mockUser.id,
        message: 'User creation initiated successfully',
      });

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(validRequest.email);
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockOutboxRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictError if user already exists', async () => {
      const existingUser = User.create(validRequest.email, 'Existing User');
      mockUserRepository.findByEmail.mockResolvedValue(existingUser);

      await expect(createUserUseCase.execute(validRequest)).rejects.toThrow(ConflictError);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(validRequest.email);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockOutboxRepository.save).not.toHaveBeenCalled();
    });

    it('should create outbox event with correct data', async () => {
      const mockUser = User.create(validRequest.email, validRequest.name);
      const mockOutboxEvent = OutboxEvent.create('user.created', { id: mockUser.id }, mockTraceMetadata);
      
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      await createUserUseCase.execute(validRequest);

      expect(mockOutboxRepository.save).toHaveBeenCalled();
      const outboxEvent = mockOutboxRepository.save.mock.calls[0][0];
      expect(outboxEvent.eventType).toBe('user.created');
      expect(outboxEvent.eventData).toEqual({
        id: mockUser.id,
        email: validRequest.email,
        name: validRequest.name,
      });
    });

    it('should execute within unit of work', async () => {
      const mockUser = User.create(validRequest.email, validRequest.name);
      const mockOutboxEvent = OutboxEvent.create('user.created', { id: mockUser.id }, mockTraceMetadata);
      
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockOutboxRepository.save.mockResolvedValue(mockOutboxEvent);

      await createUserUseCase.execute(validRequest);

      expect(mockUnitOfWork.execute).toHaveBeenCalled();
    });
  });
});
