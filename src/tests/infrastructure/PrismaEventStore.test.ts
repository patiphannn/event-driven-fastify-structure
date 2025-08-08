import { PrismaEventStore } from '../../infrastructure/repositories/PrismaEventStore';
import { BaseDomainEvent, DomainEvent } from '../../domain/events/DomainEvent';

// Mock Prisma Client
const mockPrismaClient = {
  $transaction: jest.fn(),
  eventLog: {
    createMany: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

// Mock DatabaseClient
jest.mock('../../infrastructure/database/DatabaseClient', () => ({
  DatabaseClient: {
    getInstance: () => mockPrismaClient,
  },
}));

// Test domain event implementation
class TestDomainEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    public readonly testData: string
  ) {
    super(aggregateId, 'TestDomainEvent', { testData });
  }
}

describe('PrismaEventStore', () => {
  let eventStore: PrismaEventStore;

  beforeEach(() => {
    jest.clearAllMocks();
    eventStore = new PrismaEventStore();
  });

  describe('saveEvents', () => {
    it('should save domain events with version control', async () => {
      const aggregateId = 'test-aggregate-id';
      const events = [
        new TestDomainEvent(aggregateId, 'test data 1'),
        new TestDomainEvent(aggregateId, 'test data 2'),
      ];
      const expectedVersion = 0;

      const mockTransaction = jest.fn();
      mockPrismaClient.$transaction.mockImplementation(mockTransaction);
      
      const mockTx = {
        eventLog: {
          findFirst: jest.fn().mockResolvedValue(null),
          createMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      
      mockTransaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      await eventStore.saveEvents(aggregateId, events, expectedVersion);

      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
      expect(mockTx.eventLog.findFirst).toHaveBeenCalledWith({
        where: { aggregateId: aggregateId },
        orderBy: { eventVersion: 'desc' },
      });
    });

    it('should handle empty events array', async () => {
      const aggregateId = 'test-aggregate-id';
      const events: DomainEvent[] = [];

      await eventStore.saveEvents(aggregateId, events, 0);

      expect(mockPrismaClient.$transaction).not.toHaveBeenCalled();
    });

    it('should throw error for version conflict', async () => {
      const aggregateId = 'test-aggregate-id';
      const events = [new TestDomainEvent(aggregateId, 'test data')];
      const expectedVersion = 0;

      const mockTransaction = jest.fn();
      mockPrismaClient.$transaction.mockImplementation(mockTransaction);
      
      const mockTx = {
        eventLog: {
          findFirst: jest.fn().mockResolvedValue({ eventVersion: 5 }),
          createMany: jest.fn(),
        },
      };
      
      mockTransaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      await expect(eventStore.saveEvents(aggregateId, events, expectedVersion))
        .rejects.toThrow('Concurrency conflict');
    });
  });

  describe('getEvents', () => {
    it('should retrieve events for an aggregate', async () => {
      const aggregateId = 'test-aggregate-id';
      const mockEvents = [
        {
          id: 'event-1',
          aggregateId: aggregateId,
          eventType: 'TestDomainEvent',
          eventData: { testData: 'test data 1' },
          eventVersion: 1,
          occurredAt: new Date(),
          metadata: {},
        },
        {
          id: 'event-2',
          aggregateId: aggregateId,
          eventType: 'TestDomainEvent',
          eventData: { testData: 'test data 2' },
          eventVersion: 2,
          occurredAt: new Date(),
          metadata: {},
        },
      ];

      mockPrismaClient.eventLog.findMany.mockResolvedValue(mockEvents);

      const result = await eventStore.getEvents(aggregateId);

      expect(mockPrismaClient.eventLog.findMany).toHaveBeenCalledWith({
        where: { aggregateId: aggregateId },
        orderBy: { eventVersion: 'asc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].aggregateId).toBe(aggregateId);
      expect(result[1].aggregateId).toBe(aggregateId);
    });

    it('should return empty array when no events found', async () => {
      const aggregateId = 'non-existent-aggregate';
      mockPrismaClient.eventLog.findMany.mockResolvedValue([]);

      const result = await eventStore.getEvents(aggregateId);

      expect(result).toEqual([]);
    });

    it('should filter by version when provided', async () => {
      const aggregateId = 'test-aggregate-id';
      const fromVersion = 2;
      mockPrismaClient.eventLog.findMany.mockResolvedValue([]);

      await eventStore.getEvents(aggregateId, fromVersion);

      expect(mockPrismaClient.eventLog.findMany).toHaveBeenCalledWith({
        where: { 
          aggregateId: aggregateId,
          eventVersion: { gt: fromVersion }
        },
        orderBy: { eventVersion: 'asc' },
      });
    });
  });
});
