import { ValidationError } from '../../shared/errors';
import { validateEmail, validateName } from '../../shared/utils';
import { getTraceMetadata } from '../../shared/utils';
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

  constructor(
    id: string,
    email: string,
    name: string,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    deletedAt: Date | null = null
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

  static create(email: string, name: string): User {
    const id = crypto.randomUUID();
    const user = new User(id, email.toLowerCase().trim(), name.trim());
    
    // Add domain event
    const eventData: UserCreatedEventData = {
      email: user.email,
      name: user.name
    };
    
    const metadata = getTraceMetadata();
    const event = new UserCreatedEvent(user.id, eventData, metadata);
    user.addDomainEvent(event);
    
    return user;
  }

  updateName(newName: string): void {
    if (this.isDeleted) {
      throw new ValidationError('Cannot update deleted user');
    }

    if (!validateName(newName)) {
      throw new ValidationError('Name must be between 2 and 100 characters');
    }

    const trimmedName = newName.trim();
    if (this._name === trimmedName) {
      return; // No change needed
    }

    const eventData: UserUpdatedEventData = {
      name: trimmedName,
      previousValues: {
        name: this._name
      }
    };

    this._name = trimmedName;
    this.updatedAt = new Date();

    const metadata = getTraceMetadata();
    const event = new UserUpdatedEvent(this.id, eventData, metadata);
    this.addDomainEvent(event);
  }

  updateEmail(newEmail: string): void {
    if (this.isDeleted) {
      throw new ValidationError('Cannot update deleted user');
    }

    if (!validateEmail(newEmail)) {
      throw new ValidationError('Invalid email format');
    }

    const trimmedEmail = newEmail.toLowerCase().trim();
    if (this._email === trimmedEmail) {
      return; // No change needed
    }

    const eventData: UserUpdatedEventData = {
      email: trimmedEmail,
      previousValues: {
        email: this._email
      }
    };

    this._email = trimmedEmail;
    this.updatedAt = new Date();

    const metadata = getTraceMetadata();
    const event = new UserUpdatedEvent(this.id, eventData, metadata);
    this.addDomainEvent(event);
  }

  delete(): void {
    if (this.isDeleted) {
      return; // Already deleted
    }

    const deletedAt = new Date();
    const eventData: UserDeletedEventData = {
      email: this._email,
      name: this._name,
      deletedAt
    };

    this._deletedAt = deletedAt;
    this.updatedAt = new Date();

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
