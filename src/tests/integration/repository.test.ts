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
    // Clean database before each test
    await testEnv.app.prisma.outboxEvent.deleteMany({});
    await testEnv.app.prisma.eventLog.deleteMany({});
    await testEnv.app.prisma.user.deleteMany({});
  });

  describe('UserRepository Integration', () => {
    it('should create and retrieve users through repository', async () => {
      const user = User.create(
        'Repository Test User',
        'repository@test.com'
      );

      const savedUser = await userRepository.save(user);
      expect(savedUser.id).toBeDefined();
      expect(savedUser.name).toBe('Repository Test User');
      expect(savedUser.email).toBe('repository@test.com');

      const foundUser = await userRepository.findById(savedUser.id);
      expect(foundUser).toBeDefined();
      expect(foundUser?.name).toBe('Repository Test User');
    });

    it('should save and retrieve users by email through repository', async () => {
      const user = User.create('Email Test User', 'email@repository.com');
      const savedUser = await userRepository.save(user);

      const foundUser = await userRepository.findByEmail('email@repository.com');

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(savedUser.id);
      expect(foundUser?.email).toBe('email@repository.com');
    });

    it('should list users with pagination through repository', async () => {
      const user1 = User.create('User 1', 'user1@repository.com');
      const user2 = User.create('User 2', 'user2@repository.com');
      const user3 = User.create('User 3', 'user3@repository.com');

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
      const user = User.create('Update Test User', 'update@repository.com');
      const savedUser = await userRepository.save(user);

      // Update the user
      savedUser.updateName('Updated Repository User');
      const updatedUser = await userRepository.save(savedUser);

      expect(updatedUser.name).toBe('Updated Repository User');
      expect(updatedUser.version).toBeGreaterThan(savedUser.version);
    });

    it('should soft delete users through repository', async () => {
      const user = User.create('Delete Test User', 'delete@repository.com');
      const savedUser = await userRepository.save(user);

      // Soft delete user
      savedUser.delete();
      await userRepository.save(savedUser);

      // Verify user is soft deleted
      const deletedUser = await userRepository.findById(savedUser.id);
      expect(deletedUser).toBeNull(); // Should not be found in normal queries

      // Verify user still exists in database but with deletedAt
      const allUsers = await testEnv.app.prisma.user.findMany({});
      expect(allUsers[0].deletedAt).toBeDefined();
    });

    it('should handle repository error scenarios', async () => {
      const user1 = User.create('Duplicate Test User', 'duplicate@repository.com');
      await userRepository.save(user1);

      const user2 = User.create('Another Duplicate User', 'duplicate@repository.com');
      
      await expect(userRepository.save(user2)).rejects.toThrow();
    });
  });

  describe('Unit of Work Integration', () => {
    it('should handle nested unit of work operations', async () => {
      const user1Data = { name: 'User 1', email: 'user1@test.com' };
      const user2Data = { name: 'User 2', email: 'user2@test.com' };

      const results = await unitOfWork.execute(async () => {
        const user1 = User.create(user1Data.name, user1Data.email);
        const user2 = User.create(user2Data.name, user2Data.email);
        
        const savedUser1 = await userRepository.save(user1);
        const savedUser2 = await userRepository.save(user2);
        
        return [savedUser1, savedUser2];
      });

      expect(results).toHaveLength(2);

      const allUsers = await userRepository.findMany(1, 10);
      expect(allUsers.users).toHaveLength(2);
    });

    it('should rollback transaction on failure', async () => {
      const baselineUser = User.create('Baseline User', 'baseline@repository.com');
      await userRepository.save(baselineUser);

      try {
        await unitOfWork.execute(async () => {
          const user1 = User.create('Should be rolled back', 'shouldrollback@repository.com');
          await userRepository.save(user1);

          // This should fail due to duplicate email
          const user2 = User.create('Duplicate', 'baseline@repository.com'); // Same email as baseline
          await userRepository.save(user2);
        });
      } catch (error) {
        // Expected to fail
      }

      const allUsers = await userRepository.findMany(1, 10);
      expect(allUsers.users).toHaveLength(1);
      expect(allUsers.users[0].email).toBe('baseline@repository.com');
    });

    it('should handle nested unit of work operations', async () => {
      const result = await unitOfWork.execute(async () => {
        const user = User.create('Nested UoW User', 'nested@repository.com');
        const savedUser = await userRepository.save(user);

        // Update in the same transaction
        savedUser.updateName('Updated in Transaction');
        const updatedUser = await userRepository.save(savedUser);

        return updatedUser;
      });

      expect(result.name).toBe('Updated in Transaction');

      // Verify the changes persisted
      const foundUser = await userRepository.findById(result.id);
      expect(foundUser?.name).toBe('Updated in Transaction');
    });
  });

  describe('Event Store Integration', () => {
    it('should store events when creating users', async () => {
      const user = User.create('Event Test User', 'event@repository.com');
      await userRepository.save(user);

      const events = await testEnv.app.prisma.eventLog.findMany({
        where: { aggregateId: user.id },
      });

      expect(events).toHaveLength(1);
      expect(events[0].aggregateId).toBe(user.id);
      expect(events[0].eventType).toBe('UserCreated');
    });

    it('should store events in sequence when updating users', async () => {
      const user = User.create('Update Event User', 'updateevent@repository.com');
      let savedUser = await userRepository.save(user);

      // Update user
      savedUser.updateName('Updated Event User');
      savedUser = await userRepository.save(savedUser);

      // Check that both create and update events were stored
      const events = await testEnv.app.prisma.eventLog.findMany({
        where: { aggregateId: savedUser.id },
        orderBy: { occurredAt: 'asc' },
      });

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('UserCreated');
      expect(events[1].eventType).toBe('UserUpdated');
    });

    it('should maintain event version ordering', async () => {
      const user = User.create('Version Test User', 'version@repository.com');
      let savedUser = await userRepository.save(user);

      // Multiple updates
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
      const bulkUsers = Array.from({ length: 25 }, (_, i) =>
        User.create(`Bulk User ${i + 1}`, `bulk${i + 1}@repository.com`)
      );

      const startTime = Date.now();

      // Create users in parallel
      const savedUsers = await Promise.all(
        bulkUsers.map(user => userRepository.save(user))
      );

      const creationTime = Date.now() - startTime;

      expect(savedUsers).toHaveLength(25);
      expect(creationTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all users exist
      const allUsers = await userRepository.findMany(1, 50);
      expect(allUsers.users).toHaveLength(25);

      const uniqueEmails = new Set(savedUsers.map(u => u.email));
      expect(uniqueEmails.size).toBe(25); // All should be unique
    });

    it('should handle concurrent operations', async () => {
      const concurrentUsers = Array.from({ length: 10 }, (_, i) =>
        User.create(`Concurrent User ${i + 1}`, `concurrent${i + 1}@repository.com`)
      );

      const startTime = Date.now();

      // Execute concurrent operations
      const savedUsers = await Promise.all(
        concurrentUsers.map(user => userRepository.save(user))
      );

      const executionTime = Date.now() - startTime;

      expect(savedUsers).toHaveLength(10);
      expect(executionTime).toBeLessThan(3000); // Should be fast due to concurrency
    });

    it('should optimize pagination performance', async () => {
      // Create test data for pagination
      const users = Array.from({ length: 50 }, (_, i) =>
        User.create(`Pagination User ${i + 1}`, `pagination${i + 1}@repository.com`)
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
    });
  });

  describe('Repository Error Handling and Domain Integration', () => {
    it('should preserve domain entity invariants during operations', async () => {
      const user = User.create('Invariant User', 'invariant@repository.com');
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
      const user = User.create('Concurrent Update User', 'concurrent@repository.com');
      const savedUser = await userRepository.save(user);

      // Get two references to the same user
      const user1 = await userRepository.findById(savedUser.id);
      const user2 = await userRepository.findById(savedUser.id);

      // Update both versions
      user1!.updateName('Update 1');
      user2!.updateName('Update 2');

      // First update should succeed
      await userRepository.save(user1!);

      // Second update should handle version conflict
      await expect(userRepository.save(user2!)).rejects.toThrow();
    });

    it('should handle data consistency across repository operations', async () => {
      const user = User.create('Consistency User', 'consistency@repository.com');
      const savedUser = await userRepository.save(user);

      // Verify user snapshot exists
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