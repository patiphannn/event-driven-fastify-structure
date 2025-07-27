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
    
    // For User aggregates, we need to handle UserCreated specially
    if (firstEvent.eventType === 'UserCreated' && firstEvent.eventData) {
      const eventData = firstEvent.eventData;
      // Create User with data from the UserCreated event
      const aggregate = new aggregateClass(
        firstEvent.aggregateId,
        eventData.email || 'unknown@example.com',  // fallback
        eventData.name || 'Unknown User',           // fallback
        firstEvent.occurredAt,
        firstEvent.occurredAt
      );

      // Apply all events to rebuild state (skip the first as it was used for construction)
      events.forEach((event, index) => {
        if (index > 0) { // Skip first event as it was used for construction
          (aggregate as any).when(event);
        }
        aggregate.applyEvent(event);
      });

      return aggregate;
    }

    // Fallback - create with minimal data and let when() handlers build the state
    const aggregate = new aggregateClass(firstEvent.aggregateId, firstEvent.occurredAt);

    // Apply all events to rebuild state
    events.forEach(event => {
      (aggregate as any).when(event);
      aggregate.applyEvent(event);
    });

    return aggregate;
  }

  // Abstract method that subclasses must implement to handle events
  protected abstract when(event: DomainEvent): void;
}
