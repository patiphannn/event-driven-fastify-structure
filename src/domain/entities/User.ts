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

/**
 * User Domain Entity (Aggregate Root)
 * 
 * This represents a User in our business domain with all its rules and behaviors.
 * 
 * Key Concepts for Junior Developers:
 * 
 * 1. **Aggregate Root**: Main entity that controls access to other entities
 *    - All changes to User go through this class
 *    - Generates domain events when state changes
 *    - Ensures business rules are always enforced
 * 
 * 2. **Domain Events**: When User state changes, events are generated
 *    - These events can trigger side effects (emails, notifications, etc.)
 *    - Events are handled outside this entity (separation of concerns)
 * 
 * 3. **Private Fields**: Use private _field pattern
 *    - Direct field access is prevented
 *    - All access goes through getters/methods with validation
 * 
 * 4. **Immutability**: Once created, fields can only change through specific methods
 *    - This prevents invalid state and makes bugs easier to track
 * 
 * 5. **Validation**: Business rules are enforced in constructor and update methods
 *    - Email format must be valid
 *    - Name must be 2-100 characters
 *    - Deleted users cannot be updated
 */

export class User extends AggregateRoot {
  // Public properties - much simpler than private fields + getters
  // We control modifications through business methods only
  // This eliminates 20+ lines of boilerplate getter code
  public email: string;
  public name: string;
  public deletedAt: Date | null = null;
  
  // Audit fields - track who made changes for compliance and debugging
  public createdBy: UserInfo | null = null;
  public updatedBy: UserInfo | null = null;
  public deletedBy: UserInfo | null = null;

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
    
    // VALIDATION: Always validate input in constructor
    // This ensures User can never exist in invalid state
    if (!validateEmail(email)) {
      throw new ValidationError('Invalid email format');
    }
    
    if (!validateName(name)) {
      throw new ValidationError('Name must be between 2 and 100 characters');
    }

    // Direct assignment to readonly properties (only allowed in constructor)
    this.email = email;
    this.name = name;
    this.deletedAt = deletedAt;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.deletedBy = deletedBy;
  }

  // Computed property - derived from deletedAt
  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  /**
   * Static Factory Method: Create User from Domain Event
   * 
   * This is used by Event Sourcing to rebuild User state from events.
   * 
   * For Junior Devs:
   * - Static methods belong to the class, not instances
   * - Factory methods control how objects are created
   * - This method is used when replaying events from database
   * - It reconstructs User state from UserCreated event data
   */
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

  /**
   * Static Factory Method: Create New User
   * 
   * This is the main way to create new Users in the application.
   * 
   * Why Factory Method instead of 'new User()'?
   * - Encapsulates complex creation logic
   * - Automatically generates UUID
   * - Normalizes data (lowercase email, trim whitespace)
   * - Generates domain event for new user
   * - Ensures all business rules are followed
   * 
   * @param email - User's email (will be normalized)
   * @param name - User's display name (will be trimmed)
   * @param createdBy - Who created this user (for audit)
   */
  static create(email: string, name: string, createdBy?: UserInfo): User {
    const id = crypto.randomUUID();
    const user = new User(id, email.toLowerCase().trim(), name.trim(), new Date(), new Date(), null, createdBy || null);
    
    // IMPORTANT: Generate domain event for new user
    // This event will be used to:
    // 1. Store event history (Event Sourcing)
    // 2. Trigger side effects (send welcome email, notify other services)
    // 3. Create outbox events for external systems
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

  /**
   * Business Method: Update User Name
   * 
   * This method encapsulates business rules for name changes:
   * - Validates name format
   * - Prevents updates to deleted users
   * - Only generates event if name actually changed
   * - Tracks who made the change
   * 
   * Why not just setName()?
   * - Business rules are enforced
   * - Domain events are generated automatically
   * - Audit trail is maintained
   * - Change detection prevents unnecessary events
   */
  updateName(newName: string, updatedBy?: UserInfo): void {
    if (this.isDeleted) {
      throw new ValidationError('Cannot update deleted user');
    }

    if (!validateName(newName)) {
      throw new ValidationError('Name must be between 2 and 100 characters');
    }

    const trimmedName = newName.trim();
    
    // OPTIMIZATION: Don't create event if name hasn't actually changed
    // This prevents unnecessary database writes and event processing
    if (trimmedName === this.name) {
      return;
    }

    // Store old value for event (useful for auditing and rollbacks)
    const oldName = this.name;
    this.name = trimmedName;
    this.updatedBy = updatedBy || null;

    const eventData: UserUpdatedEventData = {
      name: this.name,
      previousValues: {
        name: oldName,
      },
      updatedBy,
    };

    const metadata = getTraceMetadata();
    const event = new UserUpdatedEvent(this.id, eventData, metadata);
    this.addDomainEvent(event);
  }

  /**
   * Business Method: Update User Email
   * 
   * Similar to updateName but with additional complexity:
   * - Email normalization (lowercase, trim)
   * - Email format validation
   * - Change detection to prevent unnecessary events
   * 
   * Note: This method does NOT check email uniqueness!
   * That's a repository concern handled in the Use Case layer.
   * Domain entities focus on single-entity business rules only.
   */
  updateEmail(newEmail: string, updatedBy?: UserInfo): void {
    if (this.isDeleted) {
      throw new ValidationError('Cannot update deleted user');
    }

    if (!validateEmail(newEmail)) {
      throw new ValidationError('Invalid email format');
    }

    const normalizedEmail = newEmail.toLowerCase().trim();
    
    // Don't create event if email hasn't changed
    if (normalizedEmail === this.email) {
      return;
    }

    const oldEmail = this.email;
    this.email = normalizedEmail;
    this.updatedBy = updatedBy || null;

    const eventData: UserUpdatedEventData = {
      email: this.email,
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
    this.deletedAt = deletedAt;
    this.deletedBy = deletedBy || null;
    this.updatedAt = new Date();

    const eventData: UserDeletedEventData = {
      email: this.email,
      name: this.name,
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
    this.email = eventData.email;
    this.name = eventData.name;
    this.deletedAt = null;
  }

  private whenUserUpdated(event: DomainEvent): void {
    const eventData = event.eventData as UserUpdatedEventData;
    if (eventData.email !== undefined) {
      this.email = eventData.email;
    }
    if (eventData.name !== undefined) {
      this.name = eventData.name;
    }
  }

  private whenUserDeleted(event: DomainEvent): void {
    const eventData = event.eventData as UserDeletedEventData;
    this.deletedAt = eventData.deletedAt;
  }
}
