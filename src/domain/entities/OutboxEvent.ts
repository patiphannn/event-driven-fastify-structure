import { TraceMetadata } from '../../shared/types';

export class OutboxEvent {
  constructor(
    public readonly id: string,
    public readonly eventType: string,
    public readonly eventData: any,
    public readonly metadata?: TraceMetadata,
    public readonly processed: boolean = false,
    public readonly processedAt?: Date,
    public readonly createdAt: Date = new Date()
  ) {}

  static create(eventType: string, eventData: any, metadata?: TraceMetadata): OutboxEvent {
    const id = crypto.randomUUID();
    return new OutboxEvent(id, eventType, eventData, metadata);
  }
}
