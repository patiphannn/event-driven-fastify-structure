import { AggregateRoot } from '../../domain/entities/AggregateRoot';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { User } from '../../domain/entities/User';

// Create a test aggregate class without fromCreationEvent method
class TestAggregateWithoutFactory extends AggregateRoot {
  public testProperty: string = '';

  constructor(id?: string, testProperty?: string) {
    super(id || 'test-id');
    this.testProperty = testProperty || 'default';
  }

  protected when(event: DomainEvent): void {
    if (event.eventType === 'TestEvent') {
      this.testProperty = event.eventData.testProperty || 'from-event';
    }
  }
}

// Create a test aggregate with complex constructor
class TestAggregateComplex extends AggregateRoot {
  public email: string = '';
  public name: string = '';

  constructor(id: string, email?: string, name?: string, createdAt?: Date, updatedAt?: Date) {
    super(id, createdAt, updatedAt);
    // Map identifier to email if email is not provided directly
    this.email = email || '';
    this.name = name || '';
  }

  protected when(event: DomainEvent): void {
    if (event.eventType === 'TestCreated') {
      // Map event data fields correctly
      this.email = event.eventData.email || event.eventData.identifier || '';
      this.name = event.eventData.name || event.eventData.title || '';
    }
  }
}

// Test aggregate that throws in constructor
class TestAggregateThrows extends AggregateRoot {
  constructor(id: string, shouldThrow?: boolean) {
    super(id);
    if (shouldThrow) {
      throw new Error('Constructor failed');
    }
  }

  protected when(event: DomainEvent): void {
    // Empty implementation
  }
}

describe('AggregateRoot - Event Reconstruction Coverage', () => {
  describe('replayEvents static method', () => {
    it('should use fromCreationEvent when available (User case)', () => {
      const events: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'user1',
          eventType: 'UserCreated',
          eventVersion: 1,
          eventData: {
            email: 'test@example.com',
            name: 'Test User'
          },
          metadata: { traceId: 'trace1' },
          occurredAt: new Date()
        },
        {
          id: 'event2',
          aggregateId: 'user1',
          eventType: 'UserUpdated',
          eventVersion: 2,
          eventData: {
            name: 'Updated User'
          },
          metadata: { traceId: 'trace2' },
          occurredAt: new Date()
        }
      ];

      const user = AggregateRoot.replayEvents(User, events);

      expect(user).toBeInstanceOf(User);
      expect(user.id).toBe('user1');
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Updated User'); // Should be updated by second event
      expect(user.version).toBe(2);
    });

    it('should fallback to constructor with event data when no fromCreationEvent', () => {
      const testDate = new Date();
      const events: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'test1',
          eventType: 'TestCreated',
          eventVersion: 1,
          eventData: {
            email: 'test@example.com',
            name: 'Test Entity'
          },
          metadata: { traceId: 'trace1' },
          occurredAt: testDate
        }
      ];

      const aggregate = AggregateRoot.replayEvents(TestAggregateComplex, events);

      expect(aggregate).toBeInstanceOf(TestAggregateComplex);
      expect(aggregate.id).toBe('test1');
      expect(aggregate.email).toBe('test@example.com'); // From constructor
      expect(aggregate.name).toBe('Test Entity'); // From constructor
    });

    it('should handle fallback constructor with identifier field', () => {
      const testDate = new Date();
      const events: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'test1',
          eventType: 'TestCreated',
          eventVersion: 1,
          eventData: {
            identifier: 'test-identifier',
            title: 'Test Title'
          },
          metadata: { traceId: 'trace1' },
          occurredAt: testDate
        }
      ];

      const aggregate = AggregateRoot.replayEvents(TestAggregateComplex, events);

      expect(aggregate).toBeInstanceOf(TestAggregateComplex);
      expect(aggregate.id).toBe('test1');
      expect(aggregate.email).toBe('test-identifier'); // Mapped from identifier
      expect(aggregate.name).toBe('Test Title'); // Mapped from title
    });

    it('should use minimal constructor when event data is empty', () => {
      const testDate = new Date();
      const events: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'test1',
          eventType: 'TestEvent',
          eventVersion: 1,
          eventData: {}, // Empty event data
          metadata: { traceId: 'trace1' },
          occurredAt: testDate
        }
      ];

      const aggregate = AggregateRoot.replayEvents(TestAggregateWithoutFactory, events);

      expect(aggregate).toBeInstanceOf(TestAggregateWithoutFactory);
      expect(aggregate.id).toBe('test1');
      expect(aggregate.testProperty).toBe('from-event'); // Set by when() method
    });

    it('should use last resort constructor when complex constructor fails', () => {
      const testDate = new Date();
      const events: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'test1',
          eventType: 'TestEvent',
          eventVersion: 1,
          eventData: {
            email: 'test@example.com',
            name: 'Test'
          },
          metadata: { traceId: 'trace1' },
          occurredAt: testDate
        }
      ];

      // This will cause the complex constructor to fail and fall back to minimal constructor
      const aggregate = AggregateRoot.replayEvents(TestAggregateThrows, events);

      expect(aggregate).toBeInstanceOf(TestAggregateThrows);
      expect(aggregate.id).toBe('test1');
    });

    it('should apply all events in sequence when using fromCreationEvent', () => {
      const events: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'user1',
          eventType: 'UserCreated',
          eventVersion: 1,
          eventData: {
            email: 'original@example.com',
            name: 'Original Name'
          },
          metadata: { traceId: 'trace1' },
          occurredAt: new Date()
        },
        {
          id: 'event2',
          aggregateId: 'user1',
          eventType: 'UserUpdated',
          eventVersion: 2,
          eventData: {
            email: 'updated@example.com'
          },
          metadata: { traceId: 'trace2' },
          occurredAt: new Date()
        },
        {
          id: 'event3',
          aggregateId: 'user1',
          eventType: 'UserUpdated',
          eventVersion: 3,
          eventData: {
            name: 'Final Name'
          },
          metadata: { traceId: 'trace3' },
          occurredAt: new Date()
        }
      ];

      const user = AggregateRoot.replayEvents(User, events);

      expect(user.email).toBe('updated@example.com'); // From second event
      expect(user.name).toBe('Final Name'); // From third event
      expect(user.version).toBe(3); // Final version
    });

    it('should apply all events when not using fromCreationEvent', () => {
      const events: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'test1',
          eventType: 'TestEvent',
          eventVersion: 1,
          eventData: {
            testProperty: 'first-value'
          },
          metadata: { traceId: 'trace1' },
          occurredAt: new Date()
        },
        {
          id: 'event2',
          aggregateId: 'test1',
          eventType: 'TestEvent',
          eventVersion: 2,
          eventData: {
            testProperty: 'final-value'
          },
          metadata: { traceId: 'trace2' },
          occurredAt: new Date()
        }
      ];

      const aggregate = AggregateRoot.replayEvents(TestAggregateWithoutFactory, events);

      expect(aggregate.testProperty).toBe('final-value'); // Should be set by last event
      expect(aggregate.version).toBe(2);
    });

    it('should handle empty events array', () => {
      expect(() => AggregateRoot.replayEvents(User, [])).toThrow('Cannot replay empty event stream');
    });

    it('should handle constructor with default parameters', () => {
      const events: DomainEvent[] = [
        {
          id: 'event1',
          aggregateId: 'test1',
          eventType: 'TestEvent',
          eventVersion: 1,
          eventData: {
            email: 'default@example.com',
            name: 'Default Name'
          },
          metadata: { traceId: 'trace1' },
          occurredAt: new Date()
        }
      ];

      const aggregate = AggregateRoot.replayEvents(TestAggregateComplex, events);

      expect(aggregate.email).toBe('default@example.com');
      expect(aggregate.name).toBe('Default Name');
    });
  });
});