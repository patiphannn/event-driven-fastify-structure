import { User } from '../../domain/entities/User';
import { UserInfo } from '../../shared/types/UserInfo';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { validateEmail, validateName } from '../../shared/utils';

// Mock the validation functions
jest.mock('../../shared/utils', () => ({
  validateEmail: jest.fn(),
  validateName: jest.fn(),
  getTraceMetadata: jest.fn(() => ({
    traceId: '00000000000000000000000000000000',
    spanId: '0000000000000000'
  }))
}));

describe('User Entity - Event Reconstruction Coverage', () => {
  let user: User;
  let userInfo: UserInfo;

  beforeEach(() => {
    jest.clearAllMocks();
    (validateEmail as jest.Mock).mockReturnValue(true);
    (validateName as jest.Mock).mockReturnValue(true);

    userInfo = {
      id: '456',
      email: 'creator@example.com',
      name: 'Creator User'
    };

    user = User.create('test@example.com', 'Test User', userInfo);
  });

  describe('fromCreationEvent static method', () => {
    it('should create User from valid UserCreated event', () => {
      const creationEvent: DomainEvent = {
        id: 'event1',
        aggregateId: 'user1',
        eventType: 'UserCreated',
        eventVersion: 1,
        eventData: {
          email: 'created@example.com',
          name: 'Created User',
          createdBy: userInfo
        },
        metadata: { traceId: 'trace1' },
        occurredAt: new Date()
      };

      const createdUser = User.fromCreationEvent(creationEvent);

      expect(createdUser.id).toBe('user1');
      expect(createdUser.email).toBe('created@example.com');
      expect(createdUser.name).toBe('Created User');
      expect(createdUser.version).toBe(0); // fromCreationEvent creates user but doesn't apply event yet
    });

    it('should throw error for invalid event type', () => {
      const invalidEvent: DomainEvent = {
        id: 'event1',
        aggregateId: 'user1',
        eventType: 'UserUpdated', // Wrong type
        eventVersion: 1,
        eventData: {
          email: 'test@example.com',
          name: 'Test User'
        },
        metadata: { traceId: 'trace1' },
        occurredAt: new Date()
      };

      expect(() => User.fromCreationEvent(invalidEvent))
        .toThrow('Invalid creation event type for User aggregate');
    });

    it('should handle event with missing email/name gracefully', () => {
      const eventWithMissingData: DomainEvent = {
        id: 'event1',
        aggregateId: 'user1',
        eventType: 'UserCreated',
        eventVersion: 1,
        eventData: {
          // Missing email and name
          createdBy: userInfo
        },
        metadata: { traceId: 'trace1' },
        occurredAt: new Date()
      };

      const createdUser = User.fromCreationEvent(eventWithMissingData);

      expect(createdUser.email).toBe('unknown@example.com');
      expect(createdUser.name).toBe('Unknown User');
    });
  });

  describe('when method - event handling', () => {
    it('should handle UserCreated event correctly', () => {
      const userCreatedEvent: DomainEvent = {
        id: 'event1',
        aggregateId: user.id,
        eventType: 'UserCreated',
        eventVersion: 1,
        eventData: {
          email: 'new@example.com',
          name: 'New User',
          createdBy: userInfo
        },
        metadata: { traceId: 'trace1' },
        occurredAt: new Date()
      };

      // Access protected method via any cast for testing
      (user as any).when(userCreatedEvent);

      expect(user.email).toBe('new@example.com');
      expect(user.name).toBe('New User');
      expect(user.deletedAt).toBeNull();
    });

    it('should handle UserUpdated event correctly', () => {
      const userUpdatedEvent: DomainEvent = {
        id: 'event2',
        aggregateId: user.id,
        eventType: 'UserUpdated',
        eventVersion: 2,
        eventData: {
          email: 'updated@example.com',
          name: 'Updated User',
          updatedBy: userInfo
        },
        metadata: { traceId: 'trace2' },
        occurredAt: new Date()
      };

      const originalEmail = user.email;
      const originalName = user.name;

      (user as any).when(userUpdatedEvent);

      expect(user.email).toBe('updated@example.com');
      expect(user.name).toBe('Updated User');
    });

    it('should handle UserUpdated event with partial data', () => {
      const originalEmail = user.email;
      const originalName = user.name;

      const partialUpdateEvent: DomainEvent = {
        id: 'event2',
        aggregateId: user.id,
        eventType: 'UserUpdated',
        eventVersion: 2,
        eventData: {
          name: 'Only Name Updated',
          updatedBy: userInfo
          // email is undefined
        },
        metadata: { traceId: 'trace2' },
        occurredAt: new Date()
      };

      (user as any).when(partialUpdateEvent);

      expect(user.email).toBe(originalEmail); // Should remain unchanged
      expect(user.name).toBe('Only Name Updated');
    });

    it('should handle UserDeleted event correctly', () => {
      const deletedAt = new Date();
      const userDeletedEvent: DomainEvent = {
        id: 'event3',
        aggregateId: user.id,
        eventType: 'UserDeleted',
        eventVersion: 3,
        eventData: {
          deletedAt: deletedAt,
          deletedBy: userInfo
        },
        metadata: { traceId: 'trace3' },
        occurredAt: new Date()
      };

      (user as any).when(userDeletedEvent);

      expect(user.deletedAt).toEqual(deletedAt);
      expect(user.isDeleted).toBe(true);
    });

    it('should throw error for unknown event type', () => {
      const unknownEvent: DomainEvent = {
        id: 'event4',
        aggregateId: user.id,
        eventType: 'UnknownEvent',
        eventVersion: 4,
        eventData: {},
        metadata: { traceId: 'trace4' },
        occurredAt: new Date()
      };

      expect(() => (user as any).when(unknownEvent))
        .toThrow('Unknown event type: UnknownEvent');
    });
  });

  describe('private event handler methods', () => {
    it('should call whenUserCreated for UserCreated events', () => {
      const spy = jest.spyOn(user as any, 'whenUserCreated');
      
      const event: DomainEvent = {
        id: 'event1',
        aggregateId: user.id,
        eventType: 'UserCreated',
        eventVersion: 1,
        eventData: { email: 'test@example.com', name: 'Test' },
        metadata: { traceId: 'trace1' },
        occurredAt: new Date()
      };

      (user as any).when(event);

      expect(spy).toHaveBeenCalledWith(event);
      spy.mockRestore();
    });

    it('should call whenUserUpdated for UserUpdated events', () => {
      const spy = jest.spyOn(user as any, 'whenUserUpdated');
      
      const event: DomainEvent = {
        id: 'event2',
        aggregateId: user.id,
        eventType: 'UserUpdated',
        eventVersion: 2,
        eventData: { name: 'Updated' },
        metadata: { traceId: 'trace2' },
        occurredAt: new Date()
      };

      (user as any).when(event);

      expect(spy).toHaveBeenCalledWith(event);
      spy.mockRestore();
    });

    it('should call whenUserDeleted for UserDeleted events', () => {
      const spy = jest.spyOn(user as any, 'whenUserDeleted');
      
      const event: DomainEvent = {
        id: 'event3',
        aggregateId: user.id,
        eventType: 'UserDeleted',
        eventVersion: 3,
        eventData: { deletedAt: new Date() },
        metadata: { traceId: 'trace3' },
        occurredAt: new Date()
      };

      (user as any).when(event);

      expect(spy).toHaveBeenCalledWith(event);
      spy.mockRestore();
    });
  });

  describe('Line 108 coverage - Constructor edge cases', () => {
    it('should handle User creation with all parameters', () => {
      const testDate = new Date('2025-10-02T12:11:20.666Z');
      
      // Create user with proper constructor parameters
      const userWithDeletion = new (User as any)(
        'custom-user',
        'custom@example.com',
        'Custom User',
        testDate, // createdAt
        testDate, // updatedAt
        null, // deletedAt - null by default
        userInfo, // createdBy
        userInfo, // updatedBy
        null // deletedBy
      );

      expect(userWithDeletion.id).toBe('custom-user');
      expect(userWithDeletion.email).toBe('custom@example.com');
      expect(userWithDeletion.name).toBe('Custom User');
      expect(userWithDeletion.deletedAt).toBe(null);
      expect(userWithDeletion.version).toBe(0); // Initial version is 0
    });

    it('should handle User creation with null deletedAt', () => {
      const userNotDeleted = new (User as any)(
        'active-id',
        'active@example.com',
        'Active User',
        null, // deletedAt
        2 // version
      );

      expect(userNotDeleted.deletedAt).toBeNull();
      expect(userNotDeleted.isDeleted).toBe(false);
    });
  });

  describe('Business logic coverage', () => {
    it('should validate email when updating', () => {
      (validateEmail as jest.Mock).mockReturnValue(false);

      expect(() => user.updateEmail('invalid-email', userInfo))
        .toThrow('Invalid email format');
      
      expect(validateEmail).toHaveBeenCalledWith('invalid-email');
    });

    it('should validate name when updating', () => {
      (validateName as jest.Mock).mockReturnValue(false);

      expect(() => user.updateName('x', userInfo))
        .toThrow('Name must be between 2 and 100 characters');
      
      expect(validateName).toHaveBeenCalledWith('x');
    });
  });
});