import { DomainEvent } from '../events/DomainEvent';

export abstract class AggregateRoot {
  private _domainEvents: DomainEvent[] = [];
  private _version: number = 0;

  constructor(
    public readonly id: string,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  get version(): number {
    return this._version;
  }

  get domainEvents(): ReadonlyArray<DomainEvent> {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
    this._version++;
    this.updatedAt = new Date();
  }

  public clearDomainEvents(): void {
    this._domainEvents = [];
  }

  protected applyEvent(event: DomainEvent): void {
    this._version++;
    this.updatedAt = event.occurredAt;
  }

  // Replay events to rebuild aggregate state
  public static replayEvents<T extends AggregateRoot>(
    aggregateClass: new (...args: any[]) => T,
    events: DomainEvent[]
  ): T {
    if (events.length === 0) {
      throw new Error('Cannot replay empty event stream');
    }

    // Create initial aggregate from first event
    const firstEvent = events[0];
    
    // Try to create aggregate using the creation event data
    let aggregate: T;
    
    // Check if the aggregate class has a static factory method for creation events
    if (typeof (aggregateClass as any).fromCreationEvent === 'function') {
      aggregate = (aggregateClass as any).fromCreationEvent(firstEvent);
    } else {
      // Fallback - try to create with basic constructor parameters
      try {
        // For entities that need specific constructor parameters, try with event data
        if (firstEvent.eventData && Object.keys(firstEvent.eventData).length > 0) {
          const eventData = firstEvent.eventData;
          // Try different constructor patterns based on available data
          aggregate = new aggregateClass(
            firstEvent.aggregateId,
            eventData.email || eventData.identifier || 'default',
            eventData.name || eventData.title || 'Default Name',
            firstEvent.occurredAt,
            firstEvent.occurredAt
          );
        } else {
          // Minimal constructor with just ID and timestamp
          aggregate = new aggregateClass(firstEvent.aggregateId, firstEvent.occurredAt);
        }
      } catch (error) {
        // Last resort - create with minimal data and let when() handlers build the state
        aggregate = new aggregateClass(firstEvent.aggregateId);
      }
    }

    // Apply all events to rebuild state
    events.forEach((event, index) => {
      // If we used fromCreationEvent, skip the first event as it was already handled
      if (typeof (aggregateClass as any).fromCreationEvent === 'function' && index === 0) {
        aggregate.applyEvent(event);
        return;
      }
      
      // Apply event through when() handler and update version
      if (typeof (aggregate as any).when === 'function') {
        (aggregate as any).when(event);
      }
      aggregate.applyEvent(event);
    });

    return aggregate;
  }

  // Abstract method that subclasses must implement to handle events
  protected abstract when(event: DomainEvent): void;
}
