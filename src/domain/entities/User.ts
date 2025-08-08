import { ValidationError } from '../../shared/errors';
import { validateEmail, validateName } from '../../shared/utils';
import { getTraceMetadata } from '../../shared/utils';
import { UserInfo } from '../../shared/types/UserInfo';
import { AggregateRoot } from './AggregateRoot';
import { DomainEvent } from '../events/DomainEvent';
import { 
  UserCreatedEvent, 
  UserUpdatedEvent, 
  UserDeletedEvent,
  UserCreatedEventData,
  UserUpdatedEventData,
  UserDeletedEventData
} from '../events/UserEvents';

export class User extends AggregateRoot {
  private _email: string;
  private _name: string;
  private _deletedAt: Date | null = null;
  private _createdBy: UserInfo | null = null;
  private _updatedBy: UserInfo | null = null;
  private _deletedBy: UserInfo | null = null;

  constructor(
    id: string,
    email: string,
    name: string,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    deletedAt: Date | null = null,
    createdBy: UserInfo | null = null,
    updatedBy: UserInfo | null = null,
    deletedBy: UserInfo | null = null
  ) {
    super(id, createdAt, updatedAt);
    
    if (!validateEmail(email)) {
      throw new ValidationError('Invalid email format');
    }
    
    if (!validateName(name)) {
      throw new ValidationError('Name must be between 2 and 100 characters');
    }

    this._email = email;
    this._name = name;
    this._deletedAt = deletedAt;
    this._createdBy = createdBy;
    this._updatedBy = updatedBy;
    this._deletedBy = deletedBy;
  }

  get email(): string {
    return this._email;
  }

  get name(): string {
    return this._name;
  }

  get deletedAt(): Date | null {
    return this._deletedAt;
  }

  get isDeleted(): boolean {
    return this._deletedAt !== null;
  }

  get createdBy(): UserInfo | null {
    return this._createdBy;
  }

  get updatedBy(): UserInfo | null {
    return this._updatedBy;
  }

  get deletedBy(): UserInfo | null {
    return this._deletedBy;
  }

  // Static factory method for creating User from creation event (used by AggregateRoot.replayEvents)
  static fromCreationEvent(event: DomainEvent): User {
    if (event.eventType !== 'UserCreated') {
      throw new Error('Invalid creation event type for User aggregate');
    }
    
    const eventData = event.eventData as UserCreatedEventData;
    return new User(
      event.aggregateId,
      eventData.email || 'unknown@example.com',
      eventData.name || 'Unknown User',
      event.occurredAt,
      event.occurredAt,
      null, // deletedAt
      eventData.createdBy || null, // createdBy
      null, // updatedBy
      null // deletedBy
    );
  }

  static create(email: string, name: string, createdBy?: UserInfo): User {
    const id = crypto.randomUUID();
    const user = new User(id, email.toLowerCase().trim(), name.trim(), new Date(), new Date(), null, createdBy || null);
    
    // Add domain event
    const eventData: UserCreatedEventData = {
      email: user.email,
      name: user.name,
      createdBy
    };
    
    const metadata = getTraceMetadata();
    const event = new UserCreatedEvent(user.id, eventData, metadata);
    user.addDomainEvent(event);
    
    return user;
  }

  updateName(newName: string, updatedBy?: UserInfo): void {
    if (this.isDeleted) {
      throw new ValidationError('Cannot update deleted user');
    }

    if (!validateName(newName)) {
      throw new ValidationError('Name must be between 2 and 100 characters');
    }

    const trimmedName = newName.trim();
    
    // Don't create event if name hasn't changed
    if (trimmedName === this._name) {
      return;
    }

    const oldName = this._name;
    this._name = trimmedName;
    this._updatedBy = updatedBy || null;

    const eventData: UserUpdatedEventData = {
      name: this._name,
      previousValues: {
        name: oldName,
      },
      updatedBy,
    };

    const metadata = getTraceMetadata();
    const event = new UserUpdatedEvent(this.id, eventData, metadata);
    this.addDomainEvent(event);
  }

  updateEmail(newEmail: string, updatedBy?: UserInfo): void {
    if (this.isDeleted) {
      throw new ValidationError('Cannot update deleted user');
    }

    if (!validateEmail(newEmail)) {
      throw new ValidationError('Invalid email format');
    }

    const normalizedEmail = newEmail.toLowerCase().trim();
    
    // Don't create event if email hasn't changed
    if (normalizedEmail === this._email) {
      return;
    }

    const oldEmail = this._email;
    this._email = normalizedEmail;
    this._updatedBy = updatedBy || null;

    const eventData: UserUpdatedEventData = {
      email: this._email,
      previousValues: {
        email: oldEmail,
      },
      updatedBy,
    };

    const metadata = getTraceMetadata();
    const event = new UserUpdatedEvent(this.id, eventData, metadata);
    this.addDomainEvent(event);
  }

  delete(deletedBy?: UserInfo): void {
    if (this.isDeleted) {
      return; // Already deleted
    }

    const deletedAt = new Date();
    this._deletedAt = deletedAt;
    this._deletedBy = deletedBy || null;
    this.updatedAt = new Date();

    const eventData: UserDeletedEventData = {
      email: this._email,
      name: this._name,
      deletedAt,
      deletedBy
    };

    const metadata = getTraceMetadata();
    const event = new UserDeletedEvent(this.id, eventData, metadata);
    this.addDomainEvent(event);
  }

  // Event handler for rebuilding state from events
  protected when(event: DomainEvent): void {
    switch (event.eventType) {
      case 'UserCreated':
        this.whenUserCreated(event);
        break;
      case 'UserUpdated':
        this.whenUserUpdated(event);
        break;
      case 'UserDeleted':
        this.whenUserDeleted(event);
        break;
      default:
        throw new Error(`Unknown event type: ${event.eventType}`);
    }
  }

  private whenUserCreated(event: DomainEvent): void {
    const eventData = event.eventData as UserCreatedEventData;
    this._email = eventData.email;
    this._name = eventData.name;
    this._deletedAt = null;
  }

  private whenUserUpdated(event: DomainEvent): void {
    const eventData = event.eventData as UserUpdatedEventData;
    if (eventData.email !== undefined) {
      this._email = eventData.email;
    }
    if (eventData.name !== undefined) {
      this._name = eventData.name;
    }
  }

  private whenUserDeleted(event: DomainEvent): void {
    const eventData = event.eventData as UserDeletedEventData;
    this._deletedAt = eventData.deletedAt;
  }
}
