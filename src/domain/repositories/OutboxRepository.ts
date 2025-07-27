import { OutboxEvent } from '../entities/OutboxEvent';

export interface OutboxRepository {
  save(event: OutboxEvent): Promise<OutboxEvent>;
  findUnprocessed(): Promise<OutboxEvent[]>;
  markAsProcessed(eventId: string): Promise<void>;
}
