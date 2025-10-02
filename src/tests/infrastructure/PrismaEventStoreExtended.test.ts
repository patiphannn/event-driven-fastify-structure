import { PrismaEventStore } from '../../infrastructure/repositories/PrismaEventStore';
import { DatabaseClient } from '../../infrastructure/database/DatabaseClient';
import { ConflictError, InternalServerError } from '../../shared/errors';
import { DomainEvent } from '../../domain/events/DomainEvent';

// Mock DatabaseClient
jest.mock('../../infrastructure/database/DatabaseClient');

describe('PrismaEventStore - Extended Coverage', () => {
  let eventStore: PrismaEventStore;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPrisma = {
      $transaction: jest.fn(),
      eventLog: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    (DatabaseClient.getInstance as jest.Mock).mockReturnValue(mockPrisma);
    eventStore = new PrismaEventStore();
  });

  describe('extractUpdatedBy private method coverage', () => {
    it('should extract updatedBy when present', () => {
      const eventData = { updatedBy: { id: '123', name: 'Updater' } };
      // Access private method via any cast for testing
      const result = (eventStore as any).extractUpdatedBy(eventData);
      expect(result).toEqual({ id: '123', name: 'Updater' });
    });

    it('should extract deletedBy when updatedBy not present', () => {
      const eventData = { deletedBy: { id: '456', name: 'Deleter' } };
      const result = (eventStore as any).extractUpdatedBy(eventData);
      expect(result).toEqual({ id: '456', name: 'Deleter' });
    });

    it('should return null when neither updatedBy nor deletedBy present', () => {
      const eventData = { someOtherField: 'value' };
      const result = (eventStore as any).extractUpdatedBy(eventData);
      expect(result).toBeNull();
    });
  });

  describe('getAllEvents', () => {
    it('should get all events without position filter', async () => {
      const mockEventRecords = [
        {
          id: 'event1',
          aggregateId: 'user1',
          eventType: 'UserCreated',
          eventVersion: 1,
          eventData: { email: 'test@example.com' },
          metadata: { traceId: 'trace1' },
          occurredAt: new Date(),
        },
      ];

      mockPrisma.eventLog.findMany.mockResolvedValue(mockEventRecords);

      const result = await eventStore.getAllEvents();

      expect(mockPrisma.eventLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { position: 'asc' },
        take: undefined,
        select: {
          id: true,
          aggregateId: true,
          eventType: true,
          eventVersion: true,
          eventData: true,
          metadata: true,
          occurredAt: true,
        },
      });

      expect(result).toEqual([
        {
          id: 'event1',
          aggregateId: 'user1',
          eventType: 'UserCreated',
          eventVersion: 1,
          eventData: { email: 'test@example.com' },
          metadata: { traceId: 'trace1' },
          occurredAt: mockEventRecords[0].occurredAt,
        },
      ]);
    });

    it('should get all events with position filter', async () => {
      const mockEventRecords: any[] = [];
      mockPrisma.eventLog.findMany.mockResolvedValue(mockEventRecords);

      await eventStore.getAllEvents(100, 50);

      expect(mockPrisma.eventLog.findMany).toHaveBeenCalledWith({
        where: { position: { gt: 100 } },
        orderBy: { position: 'asc' },
        take: 50,
        select: {
          id: true,
          aggregateId: true,
          eventType: true,
          eventVersion: true,
          eventData: true,
          metadata: true,
          occurredAt: true,
        },
      });

      expect(mockEventRecords).toEqual([]);
    });

    it('should handle database errors in getAllEvents', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.eventLog.findMany.mockRejectedValue(dbError);

      await expect(eventStore.getAllEvents()).rejects.toThrow('Database connection failed');
    });
  });

  describe('getEventsByType', () => {
    it('should get events by type without position filter', async () => {
      const mockEventRecords = [
        {
          id: 'event1',
          aggregateId: 'user1',
          eventType: 'UserCreated',
          eventVersion: 1,
          eventData: { email: 'test@example.com' },
          metadata: { traceId: 'trace1' },
          occurredAt: new Date(),
        },
      ];

      mockPrisma.eventLog.findMany.mockResolvedValue(mockEventRecords);

      const result = await eventStore.getEventsByType('UserCreated');

      expect(mockPrisma.eventLog.findMany).toHaveBeenCalledWith({
        where: { eventType: 'UserCreated' },
        orderBy: { position: 'asc' },
        take: undefined,
        select: {
          id: true,
          aggregateId: true,
          eventType: true,
          eventVersion: true,
          eventData: true,
          metadata: true,
          occurredAt: true,
        },
      });

      expect(result).toEqual([
        {
          id: 'event1',
          aggregateId: 'user1',
          eventType: 'UserCreated',
          eventVersion: 1,
          eventData: { email: 'test@example.com' },
          metadata: { traceId: 'trace1' },
          occurredAt: mockEventRecords[0].occurredAt,
        },
      ]);
    });

    it('should get events by type with position filter and max count', async () => {
      const mockEventRecords: any[] = [];
      mockPrisma.eventLog.findMany.mockResolvedValue(mockEventRecords);

      await eventStore.getEventsByType('UserUpdated', 50, 25);

      expect(mockPrisma.eventLog.findMany).toHaveBeenCalledWith({
        where: { 
          eventType: 'UserUpdated',
          position: { gt: 50 } 
        },
        orderBy: { position: 'asc' },
        take: 25,
        select: {
          id: true,
          aggregateId: true,
          eventType: true,
          eventVersion: true,
          eventData: true,
          metadata: true,
          occurredAt: true,
        },
      });

      expect(mockEventRecords).toEqual([]);
    });

    it('should handle database errors in getEventsByType', async () => {
      const dbError = new Error('Query timeout');
      mockPrisma.eventLog.findMany.mockRejectedValue(dbError);

      await expect(eventStore.getEventsByType('UserCreated')).rejects.toThrow('Query timeout');
    });
  });

  describe('getSnapshot', () => {
    it('should return null when no events exist for aggregate', async () => {
      // Mock getEvents to return empty array (indirectly testing via mockPrisma)
      mockPrisma.eventLog.findMany.mockResolvedValue([]);

      const result = await eventStore.getSnapshot('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return snapshot with events and version when events exist', async () => {
      const mockEventRecords = [
        {
          id: 'event1',
          aggregateId: 'user1',
          eventType: 'UserCreated',
          eventVersion: 1,
          eventData: { email: 'test@example.com' },
          metadata: { traceId: 'trace1' },
          occurredAt: new Date(),
        },
        {
          id: 'event2',
          aggregateId: 'user1',
          eventType: 'UserUpdated',
          eventVersion: 2,
          eventData: { name: 'Updated Name' },
          metadata: { traceId: 'trace2' },
          occurredAt: new Date(),
        },
      ];

      mockPrisma.eventLog.findMany.mockResolvedValue(mockEventRecords);

      const result = await eventStore.getSnapshot('user1');

      expect(result).toEqual({
        aggregateId: 'user1',
        events: [
          {
            id: 'event1',
            aggregateId: 'user1',
            eventType: 'UserCreated',
            eventVersion: 1,
            eventData: { email: 'test@example.com' },
            metadata: { traceId: 'trace1' },
            occurredAt: mockEventRecords[0].occurredAt,
          },
          {
            id: 'event2',
            aggregateId: 'user1',
            eventType: 'UserUpdated',
            eventVersion: 2,
            eventData: { name: 'Updated Name' },
            metadata: { traceId: 'trace2' },
            occurredAt: mockEventRecords[1].occurredAt,
          },
        ],
        version: 2,
      });
    });

    it('should handle database errors in getSnapshot', async () => {
      const dbError = new Error('Connection lost');
      mockPrisma.eventLog.findMany.mockRejectedValue(dbError);

      await expect(eventStore.getSnapshot('user1')).rejects.toThrow('Connection lost');
    });
  });

  describe('saveEvents edge cases', () => {
    it('should handle empty events array early return', async () => {
      await eventStore.saveEvents('user1', [], 0);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should handle concurrency conflict in transaction', async () => {
      const mockEvents: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'user1',
          eventType: 'UserCreated',
          eventVersion: 1,
          eventData: { email: 'test@example.com' },
          metadata: { traceId: 'trace1' },
          occurredAt: new Date(),
        },
      ];

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          eventLog: {
            findFirst: jest.fn().mockResolvedValue({ eventVersion: 2 }), // Different version
            createMany: jest.fn(),
          },
        };
        return callback(mockTx);
      });

      await expect(
        eventStore.saveEvents('user1', mockEvents, 1)
      ).rejects.toThrow(ConflictError);
    });

    it('should save events successfully when versions match', async () => {
      const mockEvents: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'user1',
          eventType: 'UserCreated',
          eventVersion: 1,
          eventData: { email: 'test@example.com' },
          metadata: { traceId: 'trace1' },
          occurredAt: new Date(),
        },
      ];

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          eventLog: {
            findFirst: jest.fn().mockResolvedValue({ eventVersion: 0 }), // Matches expected
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(mockTx);
      });

      await expect(
        eventStore.saveEvents('user1', mockEvents, 0)
      ).resolves.not.toThrow();
    });

    it('should handle database transaction errors', async () => {
      const mockEvents: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'user1',
          eventType: 'UserCreated',
          eventVersion: 1,
          eventData: { email: 'test@example.com' },
          metadata: { traceId: 'trace1' },
          occurredAt: new Date(),
        },
      ];

      const transactionError = new Error('Transaction failed');
      mockPrisma.$transaction.mockRejectedValue(transactionError);

      await expect(
        eventStore.saveEvents('user1', mockEvents, 0)
      ).rejects.toThrow('Transaction failed');
    });
  });
});