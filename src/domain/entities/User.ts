import { ValidationError } from '../../shared/errors';
import { UserValidation } from '../../shared/validation/UserValidation';
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
    const result = UserValidation.validateEmail(email);
    if (!result.success) {
      throw new ValidationError(result.error || 'Invalid email format');
    }
  }

  private validateName(name: string): void {
    const result = UserValidation.validateName(name);
    if (!result.success) {
      throw new ValidationError(result.error || 'Name must be between 2 and 100 characters');
    }
  }

  /**
   * Static Factory Method: Create New User
   */
  static create(email: string, name: string, createdBy?: UserInfo): User {
    // Use Zod validation and transformation
    const validationResult = UserValidation.validateCreateUser({ email, name });
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error || 'Invalid user data');
    }

    const { email: validatedEmail, name: validatedName } = validationResult.data!;
    const id = crypto.randomUUID();
    
    const user = new User(
      id, 
      validatedEmail, // Already lowercased and trimmed by Zod
      validatedName,  // Already trimmed by Zod
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

    const validationResult = UserValidation.validateName(newName);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error || 'Invalid name');
    }

    const trimmedName = validationResult.data!; // Already trimmed by Zod
    
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

    const validationResult = UserValidation.validateEmail(newEmail);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error || 'Invalid email');
    }

    const normalizedEmail = validationResult.data!; // Already lowercased and trimmed by Zod
    
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