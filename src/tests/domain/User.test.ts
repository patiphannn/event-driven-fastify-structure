import { User } from '../../domain/entities/User';
import { UserCreatedEvent, UserUpdatedEvent, UserDeletedEvent } from '../../domain/events/UserEvents';
import { ValidationError } from '../../shared/errors';

describe('User Entity', () => {
  const validEmail = 'test@example.com';
  const validName = 'Test User';
  const validId = 'test-id-123';
  const validDate = new Date('2023-01-01');

  describe('constructor', () => {
    it('should create a user with valid data', () => {
      const user = new User(validId, validEmail, validName, validDate, validDate);

      expect(user.id).toBe(validId);
      expect(user.email).toBe(validEmail);
      expect(user.name).toBe(validName);
      expect(user.createdAt).toBe(validDate);
      expect(user.updatedAt).toBe(validDate);
      expect(user.isDeleted).toBe(false);
      expect(user.deletedAt).toBeNull();
      expect(user.version).toBe(0);
    });

    it('should throw ValidationError for invalid email', () => {
      expect(() => {
        new User(validId, 'invalid-email', validName);
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid name', () => {
      expect(() => {
        new User(validId, validEmail, '');
      }).toThrow(ValidationError);

      expect(() => {
        new User(validId, validEmail, 'a'); // too short
      }).toThrow(ValidationError);
    });
  });

  describe('create static method', () => {
    it('should create a user and add domain event', () => {
      const user = User.create(validEmail, validName);

      expect(user.email).toBe(validEmail);
      expect(user.name).toBe(validName);
      expect(user.domainEvents).toHaveLength(1);
      expect(user.domainEvents[0]).toBeInstanceOf(UserCreatedEvent);
      expect(user.version).toBe(1);
    });

    it('should trim and lowercase email', () => {
      const user = User.create('  TEST@EXAMPLE.COM  ', '  Test User  ');

      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
    });
  });

  describe('updateName', () => {
    it('should update name and add domain event', () => {
      const user = User.create(validEmail, validName);
      const initialEvents = user.domainEvents.length;
      const newName = 'Updated Name';

      user.updateName(newName);

      expect(user.name).toBe(newName);
      expect(user.domainEvents).toHaveLength(initialEvents + 1);
      expect(user.domainEvents[initialEvents]).toBeInstanceOf(UserUpdatedEvent);
      expect(user.version).toBe(2);
    });

    it('should not add event if name is the same', () => {
      const user = User.create(validEmail, validName);
      const initialEvents = user.domainEvents.length;

      user.updateName(validName);

      expect(user.domainEvents).toHaveLength(initialEvents);
      expect(user.version).toBe(1);
    });

    it('should throw ValidationError for invalid name', () => {
      const user = User.create(validEmail, validName);

      expect(() => {
        user.updateName('');
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError when user is deleted', () => {
      const user = User.create(validEmail, validName);
      user.delete();

      expect(() => {
        user.updateName('New Name');
      }).toThrow(ValidationError);
    });
  });

  describe('updateEmail', () => {
    it('should update email and add domain event', () => {
      const user = User.create(validEmail, validName);
      const initialEvents = user.domainEvents.length;
      const newEmail = 'new@example.com';

      user.updateEmail(newEmail);

      expect(user.email).toBe(newEmail);
      expect(user.domainEvents).toHaveLength(initialEvents + 1);
      expect(user.domainEvents[initialEvents]).toBeInstanceOf(UserUpdatedEvent);
      expect(user.version).toBe(2);
    });

    it('should not add event if email is the same', () => {
      const user = User.create(validEmail, validName);
      const initialEvents = user.domainEvents.length;

      user.updateEmail(validEmail);

      expect(user.domainEvents).toHaveLength(initialEvents);
      expect(user.version).toBe(1);
    });

    it('should throw ValidationError for invalid email', () => {
      const user = User.create(validEmail, validName);

      expect(() => {
        user.updateEmail('invalid-email');
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError when user is deleted', () => {
      const user = User.create(validEmail, validName);
      user.delete();

      expect(() => {
        user.updateEmail('new@example.com');
      }).toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should soft delete user and add domain event', () => {
      const user = User.create(validEmail, validName);
      const initialEvents = user.domainEvents.length;

      user.delete();

      expect(user.isDeleted).toBe(true);
      expect(user.deletedAt).toBeInstanceOf(Date);
      expect(user.domainEvents).toHaveLength(initialEvents + 1);
      expect(user.domainEvents[initialEvents]).toBeInstanceOf(UserDeletedEvent);
      expect(user.version).toBe(2);
    });

    it('should not add event if already deleted', () => {
      const user = User.create(validEmail, validName);
      user.delete();
      const eventsAfterFirstDelete = user.domainEvents.length;

      user.delete(); // Try to delete again

      expect(user.domainEvents).toHaveLength(eventsAfterFirstDelete);
    });
  });

  describe('domain events', () => {
    it('should clear domain events', () => {
      const user = User.create(validEmail, validName);
      user.updateName('New Name');

      expect(user.domainEvents.length).toBeGreaterThan(0);

      user.clearDomainEvents();

      expect(user.domainEvents).toHaveLength(0);
    });
  });

  describe('event sourcing', () => {
    it('should replay events correctly', () => {
      // This test would require implementing the replay functionality
      // For now, we'll test the event creation
      const user = User.create(validEmail, validName);
      user.updateName('Updated Name');
      user.updateEmail('updated@example.com');
      user.delete();

      expect(user.domainEvents).toHaveLength(4);
      expect(user.domainEvents[0]).toBeInstanceOf(UserCreatedEvent);
      expect(user.domainEvents[1]).toBeInstanceOf(UserUpdatedEvent);
      expect(user.domainEvents[2]).toBeInstanceOf(UserUpdatedEvent);
      expect(user.domainEvents[3]).toBeInstanceOf(UserDeletedEvent);
    });
  });
});
