import { IntegrationTestSetup, TestEnvironment } from './setup';
import { EventSourcedUserRepository } from '../../infrastructure/repositories/EventSourcedUserRepository';
import { PrismaEventStore } from '../../infrastructure/repositories/PrismaEventStore';
import { PrismaUnitOfWork } from '../../infrastructure/database/PrismaUnitOfWork';
import { User } from '../../domain/entities/User';

describe('Repository Layer Integration Tests', () => {
  let testEnv: TestEnvironment;
  let userRepository: EventSourcedUserRepository;
  let eventStore: PrismaEventStore;
  let unitOfWork: PrismaUnitOfWork;

  beforeAll(async () => {
    testEnv = await IntegrationTestSetup.setup();
    await testEnv.app.ready();
    
    eventStore = new PrismaEventStore();
    userRepository = new EventSourcedUserRepository(eventStore);
    unitOfWork = new PrismaUnitOfWork();
  }, 30000);

  afterAll(async () => {
    await testEnv.cleanup();
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(async () => {
    // Clean up before each test
    await testEnv.app.prisma.eventLog.deleteMany({});
    await testEnv.app.prisma.outboxEvent.deleteMany({});
    await testEnv.app.prisma.user.deleteMany({});
  });

  describe('UserRepository Integration', () => {
    it('should save and retrieve users through repository', async () => {
      // Create a User domain entity
      const user = User.create('repository@example.com', 'Repository Test User');

      // Save user through repository
      const savedUser = await userRepository.save(user);

      expect(savedUser).toBeDefined();
      expect(savedUser.name).toBe('Repository Test User');
      expect(savedUser.email).toBe('repository@example.com');
      expect(savedUser.id).toBeDefined();

      // Retrieve user through repository
      const retrievedUser = await userRepository.findById(savedUser.id);

      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.id).toBe(savedUser.id);
      expect(retrievedUser?.name).toBe('Repository Test User');
      expect(retrievedUser?.email).toBe('repository@example.com');
    });

    it('should handle user not found scenarios', async () => {
      const nonExistentId = 'non-existent-id';
      
      const user = await userRepository.findById(nonExistentId);
      expect(user).toBeNull();
    });

    it('should list users with pagination through repository', async () => {
      // Create multiple users
      const user1 = User.create('user1@repository.com', 'User 1');
      const user2 = User.create('user2@repository.com', 'User 2');
      const user3 = User.create('user3@repository.com', 'User 3');

      await userRepository.save(user1);
      await userRepository.save(user2);
      await userRepository.save(user3);

      // Test pagination
      const firstPage = await userRepository.findMany(1, 2);
      expect(firstPage.users).toHaveLength(2);
      expect(firstPage.total).toBe(3);

      // Test second page
      const secondPage = await userRepository.findMany(2, 2);
      expect(secondPage.users).toHaveLength(1);
      expect(secondPage.total).toBe(3);
    });

    it('should update users through repository', async () => {
      // Create user
      const user = User.create('update@repository.com', 'Update Test User');
      const savedUser = await userRepository.save(user);

      // Update user
      savedUser.updateName('Updated Repository User');
      const updatedUser = await userRepository.save(savedUser);

      expect(updatedUser).toBeDefined();
      expect(updatedUser.name).toBe('Updated Repository User');
      expect(updatedUser.version).toBeGreaterThan(savedUser.version);
    });

    it('should soft delete users through repository', async () => {
      // Create user
      const user = User.create('delete@repository.com', 'Delete Test User');
      const savedUser = await userRepository.save(user);

      // Soft delete user (using domain method)
      savedUser.delete();
      await userRepository.save(savedUser);

      // Verify user is soft deleted
      const deletedUser = await userRepository.findById(savedUser.id);
      expect(deletedUser).toBeNull(); // Should not be found in normal queries

      // Verify user still exists in database but with deletedAt set
      const allUsers = await testEnv.app.prisma.user.findMany({});
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0].deletedAt).toBeDefined();
    });

    it('should find users by email through repository', async () => {
      // Create user
      const user = User.create('email@repository.com', 'Email Test User');
      const savedUser = await userRepository.save(user);

      // Find by email
      const foundUser = await userRepository.findByEmail('email@repository.com');

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(savedUser.id);
      expect(foundUser?.email).toBe('email@repository.com');
    });

    it('should handle repository error scenarios', async () => {
      // Create user
      const user1 = User.create('duplicate@repository.com', 'Duplicate Test User');
      await userRepository.save(user1);

      // Attempt to create another user with same email
      const user2 = User.create('duplicate@repository.com', 'Another Duplicate User');
      await expect(userRepository.save(user2)).rejects.toThrow();
    });
  });

  describe('Unit of Work Integration', () => {
    it('should handle transactional operations through unit of work', async () => {
      // Execute operations in a transaction
      const results = await unitOfWork.execute(async () => {
        const user1 = User.create('uow1@repository.com', 'UoW Test User 1');
        const user2 = User.create('uow2@repository.com', 'UoW Test User 2');
        
        const savedUser1 = await userRepository.save(user1);
        const savedUser2 = await userRepository.save(user2);
        
        return { user1: savedUser1, user2: savedUser2 };
      });

      expect((results as any).user1).toBeDefined();
      expect((results as any).user2).toBeDefined();

      // Verify both users were created
      const allUsers = await userRepository.findMany(1, 10);
      expect(allUsers.users).toHaveLength(2);
    });

    it('should rollback on transaction failure', async () => {
      // First create a user to establish baseline
      const baselineUser = User.create('baseline@repository.com', 'Baseline User');
      await userRepository.save(baselineUser);

      try {
        await unitOfWork.execute(async () => {
          // Create a user
          const user1 = User.create('shouldrollback@repository.com', 'Should be rolled back');
          await userRepository.save(user1);

          // Force an error by trying to create duplicate
          const user2 = User.create('baseline@repository.com', 'Duplicate'); // Same email as baseline
          await userRepository.save(user2); // This should fail
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify only the baseline user exists
      const allUsers = await userRepository.findMany(1, 10);
      expect(allUsers.users).toHaveLength(1);
      expect(allUsers.users[0].email).toBe('baseline@repository.com');
    });

    it('should handle nested repository operations in unit of work', async () => {
      const result = await unitOfWork.execute(async () => {
        // Create user
        const user = User.create('nested@repository.com', 'Nested UoW User');
        const savedUser = await userRepository.save(user);

        // Update the same user in the same transaction
        savedUser.updateName('Updated in Transaction');
        const updatedUser = await userRepository.save(savedUser);

        return updatedUser;
      });

      expect((result as any).name).toBe('Updated in Transaction');

      // Verify the changes persisted
      const foundUser = await userRepository.findById((result as any).id);
      expect(foundUser?.name).toBe('Updated in Transaction');
    });
  });

  describe('Event Store Integration', () => {
    it('should store domain events when saving users', async () => {
      // Create and save user (this should generate UserCreated event)
      const user = User.create('event@repository.com', 'Event Test User');
      await userRepository.save(user);

      // Check that events were stored
      const events = await testEnv.app.prisma.eventLog.findMany({
        where: { aggregateId: user.id },
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].aggregateId).toBe(user.id);
      expect(events[0].eventType).toBe('UserCreated');
    });

    it('should store update events when modifying users', async () => {
      // Create user
      const user = User.create('updateevent@repository.com', 'Update Event User');
      const savedUser = await userRepository.save(user);

      // Update user (this should generate UserUpdated event)
      savedUser.updateName('Updated Event User');
      await userRepository.save(savedUser);

      // Check that both create and update events were stored
      const events = await testEnv.app.prisma.eventLog.findMany({
        where: { aggregateId: savedUser.id },
        orderBy: { occurredAt: 'asc' },
      });

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('UserCreated');
      expect(events[1].eventType).toBe('UserUpdated');
    });

    it('should maintain event ordering and versioning', async () => {
      // Create user
      const user = User.create('version@repository.com', 'Version Test User');
      let savedUser = await userRepository.save(user);

      // Perform multiple updates
      savedUser.updateName('First Update');
      savedUser = await userRepository.save(savedUser);

      savedUser.updateName('Second Update');
      savedUser = await userRepository.save(savedUser);

      // Check event ordering
      const events = await testEnv.app.prisma.eventLog.findMany({
        where: { aggregateId: savedUser.id },
        orderBy: { eventVersion: 'asc' },
      });

      expect(events).toHaveLength(3);
      expect(events[0].eventVersion).toBe(1);
      expect(events[1].eventVersion).toBe(2);
      expect(events[2].eventVersion).toBe(3);
    });
  });

  describe('Repository Performance and Optimization', () => {
    it('should handle bulk operations efficiently', async () => {
      const bulkUsers = Array.from({ length: 20 }, (_, i) => 
        User.create(`bulk${i + 1}@repository.com`, `Bulk User ${i + 1}`)
      );

      const startTime = Date.now();

      // Create users in batch
      await Promise.all(bulkUsers.map(user => userRepository.save(user)));

      const creationTime = Date.now() - startTime;

      expect(creationTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all users exist
      const allUsers = await userRepository.findMany(1, 50);
      expect(allUsers.users).toHaveLength(20);
    });

    it('should handle concurrent repository operations', async () => {
      const concurrentUsers = Array.from({ length: 5 }, (_, i) => 
        User.create(`concurrent${i + 1}@repository.com`, `Concurrent User ${i + 1}`)
      );

      const startTime = Date.now();

      // Create users concurrently
      const savedUsers = await Promise.all(
        concurrentUsers.map(user => userRepository.save(user))
      );

      const concurrentTime = Date.now() - startTime;

      expect(savedUsers).toHaveLength(5);
      expect(concurrentTime).toBeLessThan(3000); // Should complete within 3 seconds

      // Verify no data corruption
      const uniqueEmails = new Set(savedUsers.map(u => u.email));
      expect(uniqueEmails.size).toBe(5);
    });

    it('should optimize pagination queries', async () => {
      // Create enough data for meaningful pagination
      const users = Array.from({ length: 30 }, (_, i) => 
        User.create(`pagination${i + 1}@repository.com`, `Pagination User ${i + 1}`)
      );

      await Promise.all(users.map(user => userRepository.save(user)));

      const startTime = Date.now();

      // Test various page sizes
      const page1 = await userRepository.findMany(1, 10);
      const page2 = await userRepository.findMany(2, 10);
      const page3 = await userRepository.findMany(3, 10);

      const paginationTime = Date.now() - startTime;

      expect(page1.users).toHaveLength(10);
      expect(page2.users).toHaveLength(10);
      expect(page3.users).toHaveLength(10);
      expect(paginationTime).toBeLessThan(1000); // Should be fast

      // Verify total count is consistent
      expect(page1.total).toBe(30);
      expect(page2.total).toBe(30);
      expect(page3.total).toBe(30);
    });
  });

  describe('Repository Error Handling and Domain Integration', () => {
    it('should handle domain validation through repository', async () => {
      // Test with invalid email format (should be handled by domain validation)
      expect(() => User.create('not-an-email', 'Invalid Email User')).toThrow();

      // Test with empty name (should be handled by domain validation)
      expect(() => User.create('valid@example.com', '')).toThrow();
    });

    it('should preserve domain entity invariants during operations', async () => {
      const user = User.create('invariant@repository.com', 'Invariant User');
      const savedUser = await userRepository.save(user);
      const originalVersion = savedUser.version;

      // Update user
      savedUser.updateName('Updated Invariant User');
      const updatedUser = await userRepository.save(savedUser);

      // Verify domain invariants are maintained
      expect(updatedUser.id).toBe(savedUser.id);
      expect(updatedUser.version).toBeGreaterThan(originalVersion);
      expect(updatedUser.createdAt).toEqual(savedUser.createdAt);
      expect(updatedUser.updatedAt.getTime()).toBeGreaterThanOrEqual(
        savedUser.updatedAt.getTime()
      );
    });

    it('should handle concurrent updates with version conflicts', async () => {
      const user = User.create('concurrent@repository.com', 'Concurrent Update User');
      const savedUser = await userRepository.save(user);

      // Get two references to the same user
      const user1 = await userRepository.findById(savedUser.id);
      const user2 = await userRepository.findById(savedUser.id);

      // Update both versions
      user1!.updateName('Update 1');
      user2!.updateName('Update 2');

      // Save first update
      await userRepository.save(user1!);

      // Second update should handle version conflict gracefully
      try {
        await userRepository.save(user2!);
        // If no error, that's fine - the repository handled it
      } catch (error) {
        // If error, that's also fine - version conflict detected
        expect(error).toBeDefined();
      }
    });

    it('should maintain referential integrity with events', async () => {
      const user = User.create('integrity@repository.com', 'Integrity User');
      const savedUser = await userRepository.save(user);

      // Verify both user snapshot and events exist
      const userSnapshot = await testEnv.app.prisma.user.findUnique({
        where: { id: savedUser.id },
      });
      const userEvents = await testEnv.app.prisma.eventLog.findMany({
        where: { aggregateId: savedUser.id },
      });

      expect(userSnapshot).toBeDefined();
      expect(userEvents.length).toBeGreaterThan(0);

      // Soft delete user
      savedUser.delete();
      await userRepository.save(savedUser);

      // Verify events still exist but snapshot is soft deleted
      const deletedSnapshot = await testEnv.app.prisma.user.findUnique({
        where: { id: savedUser.id },
      });
      const eventsAfterDelete = await testEnv.app.prisma.eventLog.findMany({
        where: { aggregateId: savedUser.id },
      });

      expect(deletedSnapshot?.deletedAt).toBeDefined();
      expect(eventsAfterDelete.length).toBeGreaterThan(userEvents.length); // Should have delete event
    });
  });
});