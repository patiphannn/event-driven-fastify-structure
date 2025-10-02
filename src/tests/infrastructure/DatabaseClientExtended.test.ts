import { DatabaseClient } from '../../infrastructure/database/DatabaseClient';
import { PrismaClient } from '@prisma/client';

// Mock Prisma Client
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    outboxEvent: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  })),
}));

describe('DatabaseClient', () => {
  let mockPrismaClient: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset singleton instance for clean tests
    (DatabaseClient as any).instance = null;
  });

  afterEach(async () => {
    // Clean up singleton instance
    (DatabaseClient as any).instance = null;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = DatabaseClient.getInstance();
      const instance2 = DatabaseClient.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeDefined();
    });

    it('should create only one PrismaClient instance', () => {
      DatabaseClient.getInstance();
      DatabaseClient.getInstance();
      
      // PrismaClient constructor should be called only once due to singleton
      expect(PrismaClient).toHaveBeenCalledTimes(1);
    });

    it('should initialize PrismaClient with logging configuration', () => {
      DatabaseClient.getInstance();
      
      expect(PrismaClient).toHaveBeenCalledWith({
        log: ['query', 'error', 'warn'],
      });
    });

    it('should create new instance if none exists', () => {
      // Ensure no instance exists
      (DatabaseClient as any).instance = null;
      
      const instance = DatabaseClient.getInstance();
      
      expect(instance).toBeDefined();
      expect(PrismaClient).toHaveBeenCalled();
    });

    it('should return existing instance if already created', () => {
      // Create first instance
      const instance1 = DatabaseClient.getInstance();
      
      // Reset mock call count
      jest.clearAllMocks();
      
      // Get second instance
      const instance2 = DatabaseClient.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(PrismaClient).not.toHaveBeenCalled(); // Should not create new instance
    });
  });

  describe('disconnect', () => {
    it('should call $disconnect on instance when instance exists', async () => {
      // Create instance first
      const instance = DatabaseClient.getInstance();
      mockPrismaClient = instance as jest.Mocked<PrismaClient>;
      
      await DatabaseClient.disconnect();
      
      expect(mockPrismaClient.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('should not throw error when no instance exists', async () => {
      // Ensure no instance exists
      (DatabaseClient as any).instance = null;
      
      await expect(DatabaseClient.disconnect()).resolves.not.toThrow();
    });

    it('should handle disconnection errors gracefully', async () => {
      // Create instance first
      const instance = DatabaseClient.getInstance();
      mockPrismaClient = instance as jest.Mocked<PrismaClient>;
      
      const disconnectionError = new Error('Disconnection failed');
      mockPrismaClient.$disconnect.mockRejectedValue(disconnectionError);
      
      await expect(DatabaseClient.disconnect()).rejects.toThrow('Disconnection failed');
    });
  });

  describe('database operations', () => {
    beforeEach(() => {
      mockPrismaClient = DatabaseClient.getInstance() as jest.Mocked<PrismaClient>;
    });

    it('should provide access to user model', () => {
      const client = DatabaseClient.getInstance();
      
      expect(client.user).toBeDefined();
      expect(client.user.findMany).toBeDefined();
      expect(client.user.findUnique).toBeDefined();
      expect(client.user.create).toBeDefined();
      expect(client.user.update).toBeDefined();
      expect(client.user.delete).toBeDefined();
    });

    it('should provide access to outboxEvent model', () => {
      const client = DatabaseClient.getInstance();
      
      expect(client.outboxEvent).toBeDefined();
      expect(client.outboxEvent.findMany).toBeDefined();
      expect(client.outboxEvent.create).toBeDefined();
      expect(client.outboxEvent.deleteMany).toBeDefined();
    });

    it('should provide access to transaction method', () => {
      const client = DatabaseClient.getInstance();
      
      expect(client.$transaction).toBeDefined();
      expect(typeof client.$transaction).toBe('function');
    });

    it('should provide access to connect method', () => {
      const client = DatabaseClient.getInstance();
      
      expect(client.$connect).toBeDefined();
      expect(typeof client.$connect).toBe('function');
    });

    it('should provide access to disconnect method', () => {
      const client = DatabaseClient.getInstance();
      
      expect(client.$disconnect).toBeDefined();
      expect(typeof client.$disconnect).toBe('function');
    });
  });

  describe('logging configuration', () => {
    it('should configure PrismaClient with appropriate log levels', () => {
      DatabaseClient.getInstance();
      
      expect(PrismaClient).toHaveBeenCalledWith(
        expect.objectContaining({
          log: expect.arrayContaining(['query', 'error', 'warn']),
        })
      );
    });
  });
});