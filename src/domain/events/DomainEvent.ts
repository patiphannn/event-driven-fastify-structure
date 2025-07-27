export interface DomainEvent {
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: Date;
  eventData: any;
  metadata?: {
    userId?: string;
    correlationId?: string;
    causationId?: string;
    traceId?: string;
    spanId?: string;
  };
}

export abstract class BaseDomainEvent implements DomainEvent {
  public readonly occurredAt: Date;
  public readonly eventVersion: number = 1;

  constructor(
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly eventData: any,
    public readonly metadata?: {
      userId?: string;
      correlationId?: string;
      causationId?: string;
      traceId?: string;
      spanId?: string;
    }
  ) {
    this.occurredAt = new Date();
  }
}
