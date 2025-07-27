import { DomainEvent } from '../events/DomainEvent';

export interface EventStream {
  aggregateId: string;
  events: DomainEvent[];
  version: number;
}

export interface EventStore {
  saveEvents(aggregateId: string, events: DomainEvent[], expectedVersion: number): Promise<void>;
  getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getAllEvents(fromPosition?: number, maxCount?: number): Promise<DomainEvent[]>;
  getEventsByType(eventType: string, fromPosition?: number, maxCount?: number): Promise<DomainEvent[]>;
  getSnapshot(aggregateId: string): Promise<EventStream | null>;
}
