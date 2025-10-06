import { ValidationError } from '../../shared/errors';
import { validateEmail, validateName } from '../../shared/utils';
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

/**
 * User Domain Entity - Simplified version
 * 
 * Core business rules:
 * - Email must be valid format
 * - Name must be 2-100 characters  
 * - Deleted users cannot be updated
 * - Generates domain events for state changes
 */
export class User extends AggregateRoot {
  constructor(
    id: string,
    public email: string,
    public name: string,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    public deletedAt: Date | null = null,
    public createdBy: UserInfo | null = null,
    public updatedBy: UserInfo | null = null,
    public deletedBy: UserInfo | null = null
  ) {
    super(id, createdAt, updatedAt);
    this.validateEmail(email);
    this.validateName(name);
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  private validateEmail(email: string): void {
    if (!validateEmail(email)) {
      throw new ValidationError('Invalid email format');
    }
  }

  private validateName(name: string): void {
    if (!validateName(name)) {
      throw new ValidationError('Name must be between 2 and 100 characters');
    }
  }

  /**
   * Static Factory Method: Create New User
   */
  static create(email: string, name: string, createdBy?: UserInfo): User {
    const id = crypto.randomUUID();
    const user = new User(
      id, 
      email.toLowerCase().trim(), 
      name.trim(), 
      new Date(), 
      new Date(), 
      null, 
      createdBy || null
    );
    
    // Generate domain event
    const eventData: UserCreatedEventData = {
      email: user.email,
      name: user.name,
      createdBy,
    };

    const event = new UserCreatedEvent(user.id, eventData);
    user.addDomainEvent(event);
    
    return user;
  }

  /**
   * Business Method: Update Name (simplified)
   */
  updateName(newName: string, updatedBy?: UserInfo): void {
    if (this.isDeleted) {
      throw new ValidationError('Cannot update deleted user');
    }

    this.validateName(newName);
    const trimmedName = newName.trim();
    
    if (trimmedName === this.name) {
      return; // No change needed
    }

    this.name = trimmedName;
    this.updatedBy = updatedBy || null;
    this.updatedAt = new Date();

    // Generate domain event (without previousValues)
    const eventData: UserUpdatedEventData = {
      name: this.name,
      updatedBy,
    };

    const event = new UserUpdatedEvent(this.id, eventData);
    this.addDomainEvent(event);
  }

  /**
   * Business Method: Update Email (simplified)
   */
  updateEmail(newEmail: string, updatedBy?: UserInfo): void {
    if (this.isDeleted) {
      throw new ValidationError('Cannot update deleted user');
    }

    this.validateEmail(newEmail);
    const normalizedEmail = newEmail.toLowerCase().trim();
    
    if (normalizedEmail === this.email) {
      return; // No change needed
    }

    this.email = normalizedEmail;
    this.updatedBy = updatedBy || null;
    this.updatedAt = new Date();

    // Generate domain event (without previousValues)
    const eventData: UserUpdatedEventData = {
      email: this.email,
      updatedBy,
    };

    const event = new UserUpdatedEvent(this.id, eventData);
    this.addDomainEvent(event);
  }

  /**
   * Business Method: Soft Delete (simplified)
   */
  delete(deletedBy?: UserInfo): void {
    if (this.isDeleted) {
      return; // Already deleted
    }

    this.deletedAt = new Date();
    this.deletedBy = deletedBy || null;
    this.updatedAt = new Date();

    // Generate domain event
    const eventData: UserDeletedEventData = {
      deletedBy,
    };

    const event = new UserDeletedEvent(this.id, eventData);
    this.addDomainEvent(event);
  }

  /**
   * Event Sourcing: Apply events for aggregate reconstruction (simplified)
   */
  protected when(event: DomainEvent): void {
    switch (event.eventType) {
      case 'UserCreated':
        const createdData = event.eventData as UserCreatedEventData;
        this.email = createdData.email;
        this.name = createdData.name;
        this.createdBy = createdData.createdBy || null;
        break;
        
      case 'UserUpdated':
        const updatedData = event.eventData as UserUpdatedEventData;
        if (updatedData.email) this.email = updatedData.email;
        if (updatedData.name) this.name = updatedData.name;
        this.updatedBy = updatedData.updatedBy || null;
        break;
        
      case 'UserDeleted':
        const deletedData = event.eventData as UserDeletedEventData;
        this.deletedAt = event.occurredAt;
        this.deletedBy = deletedData.deletedBy || null;
        break;
    }
  }
}