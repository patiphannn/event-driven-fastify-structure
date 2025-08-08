import { EventSourcedUserRepository } from '../../infrastructure/repositories/EventSourcedUserRepository';
import { PrismaEventStore } from '../../infrastructure/repositories/PrismaEventStore';
import { User } from '../../domain/entities/User';
import { ConflictError } from '../../shared/errors';
import * as crypto from 'crypto';

// Mock EventStore
const mockEventStore = {
  saveEvents: jest.fn(),
  getEvents: jest.fn(),
  getSnapshot: jest.fn(),
};

// Mock Prisma Client
const mockPrismaClient = {
  user: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
  },
  eventLog: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

// Mock DatabaseClient
jest.mock('../../infrastructure/database/DatabaseClient', () => ({
  DatabaseClient: {
    getInstance: () => mockPrismaClient,
  },
}));

describe('EventSourcedUserRepository', () => {
  let userRepository: EventSourcedUserRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset all event store mocks
    mockEventStore.saveEvents.mockReset();
    mockEventStore.getEvents.mockReset();
    mockEventStore.getSnapshot.mockReset();
    userRepository = new EventSourcedUserRepository(mockEventStore as any);
  });

  const validUser = User.create('test@example.com', 'Test User');
  const mockPrismaUser = {
    id: validUser.id,
    email: validUser.email,
    name: validUser.name,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  describe('save', () => {
    it('should save a new user with events', async () => {
      const newUser = User.create('test@example.com', 'Test User');
      
      // Mock email uniqueness check
      mockPrismaClient.user.findUnique.mockResolvedValue(null);
      
      // Mock event store saving events
      mockEventStore.saveEvents.mockResolvedValue(undefined);
      
      // Mock saving user snapshot
      mockPrismaClient.user.upsert.mockResolvedValue({
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        version: 1,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
        deletedAt: null,
      });

      const result = await userRepository.save(newUser);

      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { email: newUser.email, deletedAt: null },
      });
      expect(mockEventStore.saveEvents).toHaveBeenCalled();
      expect(result).toBeInstanceOf(User);
      expect(result.id).toBe(newUser.id);
      expect(newUser.domainEvents).toHaveLength(0); // Events should be cleared after save
    });

    it('should throw ConflictError for duplicate email', async () => {
      const newUser = User.create('test@example.com', 'Test User');
      
      // Mock finding existing user with same email
      mockPrismaClient.user.findUnique.mockResolvedValue({
        id: 'existing-user-id',
        email: 'test@example.com',
        name: 'Existing User',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      // Mock event store to find events for the existing user (snapshot)
      const mockSnapshot = {
        id: 'existing-user-id',
        email: 'test@example.com',
        name: 'Existing User',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const mockEvents = [
        {
          id: crypto.randomUUID(),
          aggregateId: 'existing-user-id',
          eventType: 'UserCreated',
          eventData: { email: 'test@example.com', name: 'Existing User' },
          position: 1,
          createdAt: new Date(),
        }
      ];
      mockEventStore.getSnapshot.mockResolvedValue({ snapshot: mockSnapshot, events: mockEvents });

      await expect(userRepository.save(newUser)).rejects.toThrow(ConflictError);
    });
  });

  describe('findById', () => {
    it('should return a user when found', async () => {
      // Mock finding snapshot
      const mockSnapshot = {
        id: validUser.id,
        email: validUser.email,
        name: validUser.name,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      
      // Mock finding events since snapshot
      const mockEvents = [
        {
          id: crypto.randomUUID(),
          aggregateId: validUser.id,
          eventType: 'UserCreated',
          eventData: { email: 'test@example.com', name: 'Test User' },
          position: 1,
          createdAt: new Date(),
        }
      ];
      
      mockEventStore.getSnapshot.mockResolvedValueOnce({ snapshot: mockSnapshot, events: mockEvents });

      const result = await userRepository.findById(validUser.id);

      expect(mockEventStore.getSnapshot).toHaveBeenCalledWith(validUser.id);
      expect(result).toBeInstanceOf(User);
      expect(result!.id).toBe(validUser.id);
    });

    it('should return null when user not found', async () => {
      // Clear all mocks and set specific behavior for this test
      jest.clearAllMocks();
      mockEventStore.getSnapshot.mockReset();
      
      // Mock the event store to return no events for nonexistent user
      mockEventStore.getSnapshot.mockResolvedValue({ snapshot: null, events: [] });
      
      // Mock Prisma to return null for the fallback check
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      const result = await userRepository.findById('nonexistent-id');

      expect(mockEventStore.getSnapshot).toHaveBeenCalledWith('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return a user when found by email', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue(mockPrismaUser);
      
      // Mock finding snapshot and events
      const mockSnapshot = {
        id: validUser.id,
        email: validUser.email,
        name: validUser.name,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      
      const mockEvents = [
        {
          id: crypto.randomUUID(),
          aggregateId: validUser.id,
          eventType: 'UserCreated',
          eventData: { email: 'test@example.com', name: 'Test User' },
          position: 1,
          createdAt: new Date(),
        }
      ];
      
      mockEventStore.getSnapshot.mockResolvedValue({ snapshot: mockSnapshot, events: mockEvents });

      const result = await userRepository.findByEmail(validUser.email);

      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { email: validUser.email, deletedAt: null },
      });
      expect(mockEventStore.getSnapshot).toHaveBeenCalledWith(validUser.id);
      expect(result).toBeInstanceOf(User);
      expect(result!.email).toBe(validUser.email);
    });

    it('should return null when user not found by email', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      const result = await userRepository.findByEmail('nonexistent@example.com');

      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'nonexistent@example.com', deletedAt: null },
      });
      expect(result).toBeNull();
    });
  });

  describe('findMany', () => {
    it('should return paginated users with event sourcing', async () => {
      const mockUsers = [mockPrismaUser];
      mockPrismaClient.user.findMany.mockResolvedValue(mockUsers);
      mockPrismaClient.user.count.mockResolvedValue(1);
      
      // Mock event store for each user found
      const mockSnapshot = {
        id: validUser.id,
        email: validUser.email,
        name: validUser.name,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      
      const mockEvents = [
        {
          id: crypto.randomUUID(),
          aggregateId: validUser.id,
          eventType: 'UserCreated',
          eventData: { email: 'test@example.com', name: 'Test User' },
          position: 1,
          createdAt: new Date(),
        }
      ];
      
      mockEventStore.getSnapshot.mockResolvedValue({ snapshot: mockSnapshot, events: mockEvents });

      const result = await userRepository.findMany(1, 10);

      expect(mockPrismaClient.user.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        where: { deletedAt: null },
      });
      expect(mockPrismaClient.user.count).toHaveBeenCalled();
      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.users[0]).toBeInstanceOf(User);
    });

    it('should handle pagination correctly', async () => {
      mockPrismaClient.user.findMany.mockResolvedValue([]);
      mockPrismaClient.user.count.mockResolvedValue(25);

      await userRepository.findMany(3, 10);

      expect(mockPrismaClient.user.findMany).toHaveBeenCalledWith({
        skip: 20, // (3-1) * 10
        take: 10,
        orderBy: { createdAt: 'desc' },
        where: { deletedAt: null },
      });
    });
  });
});
