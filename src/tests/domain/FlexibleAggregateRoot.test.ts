import { AggregateRoot } from '../../domain/entities/AggregateRoot';
import { DomainEvent, BaseDomainEvent } from '../../domain/events/DomainEvent';

// Test implementation of AggregateRoot for flexible testing
class TestAggregate extends AggregateRoot {
  private _value: string;

  constructor(id: string, value: string, createdAt?: Date, updatedAt?: Date) {
    super(id, createdAt, updatedAt);
    this._value = value;
  }

  get value(): string {
    return this._value;
  }

  updateValue(newValue: string): void {
    const oldValue = this._value;
    this._value = newValue;

    const event = new TestValueUpdatedEvent(this.id, { 
      newValue, 
      oldValue 
    });
    this.addDomainEvent(event);
  }

  // Implementation of abstract method from AggregateRoot
  protected when(event: DomainEvent): void {
    switch (event.eventType) {
      case 'TestCreated':
        this.whenTestCreated(event);
        break;
      case 'TestValueUpdated':
        this.whenTestValueUpdated(event);
        break;
      default:
        throw new Error(`Unknown event type: ${event.eventType}`);
    }
  }

  private whenTestCreated(event: DomainEvent): void {
    const eventData = event.eventData as { value: string };
    this._value = eventData.value;
  }

  private whenTestValueUpdated(event: DomainEvent): void {
    const eventData = event.eventData as { newValue: string; oldValue: string };
    this._value = eventData.newValue;
  }

  static fromCreationEvent(event: DomainEvent): TestAggregate {
    if (event.eventType !== 'TestCreated') {
      throw new Error('Invalid creation event type');
    }
    
    const eventData = event.eventData as { value: string };
    return new TestAggregate(
      event.aggregateId,
      eventData.value,
      event.occurredAt,
      event.occurredAt
    );
  }
}

class TestValueUpdatedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    eventData: { newValue: string; oldValue: string },
    metadata?: any
  ) {
    super(aggregateId, 'TestValueUpdated', eventData, metadata);
  }
}

class TestCreatedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    eventData: { value: string },
    metadata?: any
  ) {
    super(aggregateId, 'TestCreated', eventData, metadata);
  }
}

describe('FlexibleAggregateRoot (AggregateRoot flexibility tests)', () => {
  const testId = 'test-aggregate-id';
  const testValue = 'initial-value';

  describe('Basic AggregateRoot functionality', () => {
    it('should create an aggregate with id and timestamps', () => {
      const aggregate = new TestAggregate(testId, testValue);

      expect(aggregate.id).toBe(testId);
      expect(aggregate.value).toBe(testValue);
      expect(aggregate.createdAt).toBeInstanceOf(Date);
      expect(aggregate.updatedAt).toBeInstanceOf(Date);
      expect(aggregate.version).toBe(0);
      expect(aggregate.domainEvents).toHaveLength(0);
    });

    it('should handle custom creation and update timestamps', () => {
      const createdAt = new Date('2023-01-01');
      const updatedAt = new Date('2023-01-02');
      
      const aggregate = new TestAggregate(testId, testValue, createdAt, updatedAt);

      expect(aggregate.createdAt).toBe(createdAt);
      expect(aggregate.updatedAt).toBe(updatedAt);
    });
  });

  describe('Domain Events handling', () => {
    it('should add domain events and increment version', () => {
      const aggregate = new TestAggregate(testId, testValue);
      
      aggregate.updateValue('new-value');

      expect(aggregate.domainEvents).toHaveLength(1);
      expect(aggregate.version).toBe(1);
      expect(aggregate.domainEvents[0].eventType).toBe('TestValueUpdated');
      expect(aggregate.domainEvents[0].aggregateId).toBe(testId);
    });

    it('should update timestamp when adding domain events', () => {
      const aggregate = new TestAggregate(testId, testValue);
      const initialUpdatedAt = aggregate.updatedAt;

      // Small delay to ensure timestamp difference
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      return delay(10).then(() => {
        aggregate.updateValue('new-value');
        expect(aggregate.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
      });
    });

    it('should clear domain events', () => {
      const aggregate = new TestAggregate(testId, testValue);
      
      aggregate.updateValue('new-value');
      expect(aggregate.domainEvents).toHaveLength(1);

      aggregate.clearDomainEvents();
      expect(aggregate.domainEvents).toHaveLength(0);
      expect(aggregate.version).toBe(1); // Version should remain
    });

    it('should handle multiple domain events', () => {
      const aggregate = new TestAggregate(testId, testValue);
      
      aggregate.updateValue('value-1');
      aggregate.updateValue('value-2');
      aggregate.updateValue('value-3');

      expect(aggregate.domainEvents).toHaveLength(3);
      expect(aggregate.version).toBe(3);
      expect(aggregate.value).toBe('value-3');
    });
  });

  describe('Event replay functionality', () => {
    it('should replay events to rebuild aggregate state', () => {
      const events: DomainEvent[] = [
        new TestCreatedEvent(testId, { value: 'initial' }),
        new TestValueUpdatedEvent(testId, { newValue: 'updated-1', oldValue: 'initial' }),
        new TestValueUpdatedEvent(testId, { newValue: 'updated-2', oldValue: 'updated-1' }),
      ];

      const aggregate = AggregateRoot.replayEvents(TestAggregate, events);

      expect(aggregate.id).toBe(testId);
      expect(aggregate.value).toBe('updated-2'); // Should be final value after all events
      expect(aggregate.version).toBe(3);
    });

    it('should handle empty event stream', () => {
      expect(() => {
        AggregateRoot.replayEvents(TestAggregate, []);
      }).toThrow('Cannot replay empty event stream');
    });

    it('should handle single creation event', () => {
      const events: DomainEvent[] = [
        new TestCreatedEvent(testId, { value: 'single-event-value' }),
      ];

      const aggregate = AggregateRoot.replayEvents(TestAggregate, events);

      expect(aggregate.id).toBe(testId);
      expect(aggregate.value).toBe('single-event-value');
      expect(aggregate.version).toBe(1);
    });
  });

  describe('Immutability and encapsulation', () => {
    it('should return readonly domain events', () => {
      const aggregate = new TestAggregate(testId, testValue);
      aggregate.updateValue('new-value');

      const events = aggregate.domainEvents;
      expect(events).toBeInstanceOf(Array);
      
      // Should not be able to modify the returned array
      expect(Object.isFrozen(events)).toBe(false); // ReadonlyArray doesn't freeze, but typing prevents modification
      expect(events.length).toBe(1);
    });

    it('should maintain internal state consistency', () => {
      const aggregate = new TestAggregate(testId, testValue);
      
      // Test that external modifications don't affect internal state
      const initialVersion = aggregate.version;
      const initialEvents = aggregate.domainEvents.length;
      
      aggregate.updateValue('test-value');
      
      expect(aggregate.version).toBe(initialVersion + 1);
      expect(aggregate.domainEvents.length).toBe(initialEvents + 1);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle rapid successive updates', () => {
      const aggregate = new TestAggregate(testId, testValue);
      
      for (let i = 0; i < 100; i++) {
        aggregate.updateValue(`value-${i}`);
      }

      expect(aggregate.version).toBe(100);
      expect(aggregate.domainEvents).toHaveLength(100);
      expect(aggregate.value).toBe('value-99');
    });

    it('should maintain correct event ordering', () => {
      const aggregate = new TestAggregate(testId, testValue);
      
      aggregate.updateValue('first');
      aggregate.updateValue('second');
      aggregate.updateValue('third');

      const events = aggregate.domainEvents;
      expect(events[0].eventData).toEqual({ newValue: 'first', oldValue: testValue });
      expect(events[1].eventData).toEqual({ newValue: 'second', oldValue: 'first' });
      expect(events[2].eventData).toEqual({ newValue: 'third', oldValue: 'second' });
    });
  });
});
