import { OutboxEvent } from '../../domain/entities/OutboxEvent';

describe('OutboxEvent Entity', () => {
  const mockTraceMetadata = {
    traceId: 'test-trace-id',
    spanId: 'test-span-id',
  };

  const validEventType = 'user.created';
  const validEventData = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
  };

  describe('create static method', () => {
    it('should create an outbox event with required fields', () => {
      const event = OutboxEvent.create(validEventType, validEventData, mockTraceMetadata);

      expect(event.id).toBeDefined();
      expect(event.eventType).toBe(validEventType);
      expect(event.eventData).toEqual(validEventData);
      expect(event.metadata).toEqual(mockTraceMetadata);
      expect(event.processed).toBe(false);
      expect(event.processedAt).toBeUndefined();
      expect(event.createdAt).toBeInstanceOf(Date);
    });

    it('should create an outbox event without metadata', () => {
      const event = OutboxEvent.create(validEventType, validEventData);

      expect(event.id).toBeDefined();
      expect(event.eventType).toBe(validEventType);
      expect(event.eventData).toEqual(validEventData);
      expect(event.metadata).toBeUndefined();
      expect(event.processed).toBe(false);
      expect(event.processedAt).toBeUndefined();
      expect(event.createdAt).toBeInstanceOf(Date);
    });

    it('should generate unique IDs for different events', () => {
      const event1 = OutboxEvent.create(validEventType, validEventData, mockTraceMetadata);
      const event2 = OutboxEvent.create(validEventType, validEventData, mockTraceMetadata);

      expect(event1.id).not.toBe(event2.id);
    });
  });

  describe('constructor', () => {
    it('should create an outbox event with all fields', () => {
      const id = 'test-id';
      const createdAt = new Date();
      const processedAt = new Date();

      const event = new OutboxEvent(
        id,
        validEventType,
        validEventData,
        mockTraceMetadata,
        true,
        processedAt,
        createdAt
      );

      expect(event.id).toBe(id);
      expect(event.eventType).toBe(validEventType);
      expect(event.eventData).toEqual(validEventData);
      expect(event.processed).toBe(true);
      expect(event.processedAt).toBe(processedAt);
      expect(event.createdAt).toBe(createdAt);
      expect(event.metadata).toEqual(mockTraceMetadata);
    });

    it('should create an outbox event with default values', () => {
      const id = 'test-id';
      const createdAt = new Date();

      const event = new OutboxEvent(
        id,
        validEventType,
        validEventData,
        undefined,
        false,
        undefined,
        createdAt
      );

      expect(event.processed).toBe(false);
      expect(event.processedAt).toBeUndefined();
      expect(event.metadata).toBeUndefined();
    });
  });
});
