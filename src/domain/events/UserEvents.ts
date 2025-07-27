import { BaseDomainEvent } from './DomainEvent';

export interface UserCreatedEventData {
  email: string;
  name: string;
}

export class UserCreatedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    eventData: UserCreatedEventData,
    metadata?: {
      userId?: string;
      correlationId?: string;
      causationId?: string;
      traceId?: string;
      spanId?: string;
    }
  ) {
    super(aggregateId, 'UserCreated', eventData, metadata);
  }

  toEventData(): UserCreatedEventData {
    return this.eventData;
  }
}

export interface UserUpdatedEventData {
  name?: string;
  email?: string;
  version?: number;
  previousValues: {
    name?: string;
    email?: string;
  };
}

export class UserUpdatedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    eventData: UserUpdatedEventData,
    metadata?: {
      userId?: string;
      correlationId?: string;
      causationId?: string;
      traceId?: string;
      spanId?: string;
    }
  ) {
    super(aggregateId, 'UserUpdated', eventData, metadata);
  }

  toEventData(): UserUpdatedEventData {
    return this.eventData;
  }
}

export interface UserDeletedEventData {
  email: string;
  name: string;
  deletedAt: Date;
}

export class UserDeletedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    eventData: UserDeletedEventData,
    metadata?: {
      userId?: string;
      correlationId?: string;
      causationId?: string;
      traceId?: string;
      spanId?: string;
    }
  ) {
    super(aggregateId, 'UserDeleted', eventData, metadata);
  }

  toEventData(): UserDeletedEventData {
    return this.eventData;
  }
}
