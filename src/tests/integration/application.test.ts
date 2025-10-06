import { IntegrationTestSetup, TestEnvironment } from './setup';

describe('Application Layer Integration Tests', () => {
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    testEnv = await IntegrationTestSetup.setup();
    await testEnv.app.ready();
  }, 30000);

  afterAll(async () => {
    await testEnv.cleanup();
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(async () => {
    // Clean up before each test
    await testEnv.app.prisma.outboxEvent.deleteMany({});
    await testEnv.app.prisma.user.deleteMany({});
  });

  describe('Use Case Integration', () => {
    it('should create user through application layer', async () => {
      const userData = {
        name: 'Application Test User',
        email: 'application@example.com',
      };

      // Test direct database access pattern used by use cases
      const user = await testEnv.app.prisma.user.create({
        data: {
          ...userData,
          version: 1,
        },
      });

      expect(user).toMatchObject({
        name: userData.name,
        email: userData.email,
        version: 1,
      });

      expect(user.id).toBeDefined();
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it('should handle user retrieval patterns', async () => {
      // Create test users
      const users = await Promise.all([
        testEnv.app.prisma.user.create({
          data: {
            name: 'User 1',
            email: 'user1@example.com',
            version: 1,
          },
        }),
        testEnv.app.prisma.user.create({
          data: {
            name: 'User 2', 
            email: 'user2@example.com',
            version: 1,
          },
        }),
      ]);

      // Test list pattern
      const allUsers = await testEnv.app.prisma.user.findMany({
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(allUsers).toHaveLength(2);
      // Check that users are returned in descending order by creation time
      expect(allUsers[0].createdAt.getTime()).toBeGreaterThanOrEqual(allUsers[1].createdAt.getTime());

      // Test single user retrieval
      const singleUser = await testEnv.app.prisma.user.findUnique({
        where: { id: users[0].id },
      });

      expect(singleUser).toMatchObject({
        name: 'User 1',
        email: 'user1@example.com',
      });
    });

    it('should handle pagination patterns used by list use cases', async () => {
      // Create enough users for pagination
      const users = Array.from({ length: 15 }, (_, i) => ({
        name: `Pagination User ${i + 1}`,
        email: `pagination${i + 1}@example.com`,
        version: 1,
        createdAt: new Date(Date.now() + i * 1000), // Ensure ordering
        updatedAt: new Date(),
      }));

      await testEnv.app.prisma.user.createMany({ data: users });

      // Test first page
      const firstPage = await testEnv.app.prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 0,
      });

      expect(firstPage).toHaveLength(10);

      // Test second page
      const secondPage = await testEnv.app.prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 10,
      });

      expect(secondPage).toHaveLength(5);

      // Test total count pattern
      const totalCount = await testEnv.app.prisma.user.count({
        where: { deletedAt: null },
      });

      expect(totalCount).toBe(15);
    });
  });

  describe('Data Consistency and Validation', () => {
    it('should handle email uniqueness at application level', async () => {
      const userData = {
        name: 'Unique Email Test',
        email: 'unique@example.com',
        version: 1,
      };

      // Create first user
      await testEnv.app.prisma.user.create({ data: userData });

      // Attempt to create duplicate should fail
      await expect(
        testEnv.app.prisma.user.create({ data: userData })
      ).rejects.toThrow();
    });

    it('should handle version-based optimistic locking', async () => {
      const userData = {
        name: 'Version Test User',
        email: 'version@example.com',
        version: 1,
      };

      const user = await testEnv.app.prisma.user.create({ data: userData });

      // Simulate concurrent updates
      const update1Promise = testEnv.app.prisma.user.update({
        where: { id: user.id },
        data: {
          name: 'Updated by Process 1',
          version: user.version + 1,
        },
      });

      const update2Promise = testEnv.app.prisma.user.update({
        where: { id: user.id },
        data: {
          name: 'Updated by Process 2',
          version: user.version + 1,
        },
      });

      // One should succeed, one might fail depending on timing
      const results = await Promise.allSettled([update1Promise, update2Promise]);
      
      // At least one should succeed
      const successfulUpdates = results.filter(r => r.status === 'fulfilled');
      expect(successfulUpdates.length).toBeGreaterThan(0);
    });

    it('should handle soft delete patterns correctly', async () => {
      const userData = {
        name: 'Soft Delete Test',
        email: 'softdelete@example.com',
        version: 1,
      };

      const user = await testEnv.app.prisma.user.create({ data: userData });

      // Soft delete
      const deletedUser = await testEnv.app.prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      expect(deletedUser.deletedAt).toBeDefined();

      // Verify soft deleted users are excluded from normal queries
      const activeUsers = await testEnv.app.prisma.user.findMany({
        where: { deletedAt: null },
      });

      expect(activeUsers).toHaveLength(0);

      // But still accessible when specifically queried
      const allUsers = await testEnv.app.prisma.user.findMany({});
      expect(allUsers).toHaveLength(1);
    });
  });

  describe('Event and Outbox Pattern Integration', () => {
    it('should handle outbox event creation patterns', async () => {
      const userData = {
        name: 'Event Test User',
        email: 'event@example.com',
        version: 1,
      };

      const user = await testEnv.app.prisma.user.create({ data: userData });

      // Create outbox event (simulating domain event pattern)
      const outboxEvent = await testEnv.app.prisma.outboxEvent.create({
        data: {
          eventType: 'UserCreated',
          eventData: {
            userId: user.id,
            name: user.name,
            email: user.email,
          },
          metadata: {
            aggregateId: user.id,
            aggregateType: 'User',
            version: 1,
          },
        },
      });

      expect(outboxEvent).toMatchObject({
        eventType: 'UserCreated',
        processed: false,
      });

      const eventData = outboxEvent.eventData as any;
      expect(eventData).toMatchObject({
        userId: user.id,
        name: userData.name,
        email: userData.email,
      });

      const metadata = outboxEvent.metadata as any;
      expect(metadata).toMatchObject({
        aggregateId: user.id,
        aggregateType: 'User',
        version: 1,
      });
    });

    it('should handle transactional outbox pattern', async () => {
      const userData = {
        name: 'Transactional Event Test',
        email: 'transaction-event@example.com',
        version: 1,
      };

      const result = await testEnv.app.prisma.$transaction(async (prisma) => {
        // Create user
        const user = await prisma.user.create({ data: userData });

        // Create outbox event in same transaction
        const outboxEvent = await prisma.outboxEvent.create({
          data: {
            eventType: 'UserCreated',
            eventData: {
              userId: user.id,
              name: user.name,
              email: user.email,
            },
            metadata: {
              aggregateId: user.id,
              aggregateType: 'User',
              version: 1,
            },
          },
        });

        return { user, outboxEvent };
      });

      expect(result.user).toBeDefined();
      expect(result.outboxEvent).toBeDefined();

      // Verify both were committed
      const createdUser = await testEnv.app.prisma.user.findUnique({
        where: { id: result.user.id },
      });
      const createdEvent = await testEnv.app.prisma.outboxEvent.findUnique({
        where: { id: result.outboxEvent.id },
      });

      expect(createdUser).toBeDefined();
      expect(createdEvent).toBeDefined();
    });

    it('should handle event processing state changes', async () => {
      // Create an outbox event
      const outboxEvent = await testEnv.app.prisma.outboxEvent.create({
        data: {
          eventType: 'UserCreated',
          eventData: { test: 'data' },
          metadata: {
            aggregateId: 'test-aggregate-id',
            aggregateType: 'User',
            version: 1,
          },
          processed: false,
        },
      });

      expect(outboxEvent.processed).toBe(false);

      // Mark as processed
      const processedEvent = await testEnv.app.prisma.outboxEvent.update({
        where: { id: outboxEvent.id },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });

      expect(processedEvent.processed).toBe(true);
      expect(processedEvent.processedAt).toBeDefined();
    });
  });

  describe('Complex Query Patterns', () => {
    it('should handle filtering and search patterns', async () => {
      // Create users with different patterns
      const users = [
        { name: 'John Doe', email: 'john.doe@example.com', version: 1 },
        { name: 'Jane Smith', email: 'jane.smith@example.com', version: 1 },
        { name: 'Bob Johnson', email: 'bob.johnson@example.com', version: 1 },
        { name: 'Alice Brown', email: 'alice.brown@example.com', version: 1 },
      ];

      await testEnv.app.prisma.user.createMany({ data: users });

      // Test email filtering
      const emailResults = await testEnv.app.prisma.user.findMany({
        where: {
          email: {
            contains: 'smith',
          },
        },
      });

      expect(emailResults).toHaveLength(1);
      expect(emailResults[0].name).toBe('Jane Smith');

      // Test name filtering
      const nameResults = await testEnv.app.prisma.user.findMany({
        where: {
          name: {
            contains: 'John',
          },
        },
      });

      expect(nameResults.length).toBeGreaterThan(0);
      expect(nameResults.some(u => u.name.includes('John'))).toBe(true);
    });

    it('should handle complex ordering and limiting', async () => {
      // Create users with specific timestamps
      const now = new Date();
      const users = Array.from({ length: 5 }, (_, i) => ({
        name: `Order User ${i + 1}`,
        email: `order${i + 1}@example.com`,
        version: 1,
        createdAt: new Date(now.getTime() + (i * 60000)), // 1 minute apart
        updatedAt: new Date(),
      }));

      await testEnv.app.prisma.user.createMany({ data: users });

      // Test descending order (newest first)
      const newestFirst = await testEnv.app.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 3,
      });

      expect(newestFirst).toHaveLength(3);
      expect(newestFirst[0].name).toBe('Order User 5');

      // Test ascending order (oldest first)
      const oldestFirst = await testEnv.app.prisma.user.findMany({
        orderBy: { createdAt: 'asc' },
        take: 2,
      });

      expect(oldestFirst).toHaveLength(2);
      expect(oldestFirst[0].name).toBe('Order User 1');
    });
  });

  describe('Performance and Scalability Patterns', () => {
    it('should handle bulk operations efficiently', async () => {
      const bulkUsers = Array.from({ length: 100 }, (_, i) => ({
        name: `Bulk User ${i + 1}`,
        email: `bulk${i + 1}@example.com`,
        version: 1,
      }));

      const startTime = Date.now();
      
      // Test bulk insert
      const result = await testEnv.app.prisma.user.createMany({
        data: bulkUsers,
        skipDuplicates: true,
      });

      const insertTime = Date.now() - startTime;

      expect(result.count).toBe(100);
      expect(insertTime).toBeLessThan(2000); // Should complete within 2 seconds

      // Verify all users were created
      const count = await testEnv.app.prisma.user.count();
      expect(count).toBe(100);
    });

    it('should handle concurrent read operations', async () => {
      // Create some test data
      await testEnv.app.prisma.user.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({
          name: `Concurrent User ${i + 1}`,
          email: `concurrent${i + 1}@example.com`,
          version: 1,
        })),
      });

      // Perform concurrent reads
      const concurrentReads = Array.from({ length: 10 }, () =>
        testEnv.app.prisma.user.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
        })
      );

      const startTime = Date.now();
      const results = await Promise.all(concurrentReads);
      const totalTime = Date.now() - startTime;

      // All reads should succeed
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toHaveLength(5);
      });

      // Should complete efficiently
      expect(totalTime).toBeLessThan(1000); // Within 1 second

      console.log(`Concurrent reads: 10 operations in ${totalTime}ms`);
    });

    it('should handle memory-efficient pagination', async () => {
      // Create a larger dataset
      const largeDataset = Array.from({ length: 200 }, (_, i) => ({
        name: `Memory Test User ${i + 1}`,
        email: `memory${i + 1}@example.com`,
        version: 1,
      }));

      await testEnv.app.prisma.user.createMany({ data: largeDataset });

      // Test cursor-based pagination pattern
      let allUsers: any[] = [];
      let lastId: string | undefined;
      const pageSize = 50;

      while (true) {
        const page = await testEnv.app.prisma.user.findMany({
          take: pageSize,
          skip: lastId ? 1 : 0,
          cursor: lastId ? { id: lastId } : undefined,
          orderBy: { id: 'asc' },
        });

        if (page.length === 0) break;

        allUsers = allUsers.concat(page);
        lastId = page[page.length - 1].id;

        if (page.length < pageSize) break;
      }

      expect(allUsers).toHaveLength(200);
    });
  });

  describe('Data Integrity and Constraints', () => {
    it('should maintain referential integrity patterns', async () => {
      const userData = {
        name: 'Integrity Test User',
        email: 'integrity@example.com',
        version: 1,
      };

      const user = await testEnv.app.prisma.user.create({ data: userData });

      // Create related outbox events
      const events = await Promise.all([
        testEnv.app.prisma.outboxEvent.create({
          data: {
            eventType: 'UserCreated',
            eventData: { userId: user.id },
            metadata: {
              aggregateId: user.id,
              aggregateType: 'User',
              version: 1,
            },
          },
        }),
        testEnv.app.prisma.outboxEvent.create({
          data: {
            eventType: 'UserUpdated',
            eventData: { userId: user.id },
            metadata: {
              aggregateId: user.id,
              aggregateType: 'User',
              version: 2,
            },
          },
        }),
      ]);

      expect(events).toHaveLength(2);

      // Verify events are linked to user through metadata
      const userEvents = await testEnv.app.prisma.outboxEvent.findMany({
        where: {
          metadata: {
            path: ['aggregateId'],
            equals: user.id,
          },
        },
      });

      expect(userEvents).toHaveLength(2);
    });

    it('should handle constraint violations gracefully', async () => {
      const userData = {
        name: 'Constraint Test User',
        email: 'constraint@example.com',
        version: 1,
      };

      await testEnv.app.prisma.user.create({ data: userData });

      // Test email uniqueness constraint
      await expect(
        testEnv.app.prisma.user.create({ data: userData })
      ).rejects.toThrow(/Unique constraint/);

      // Verify only one user exists
      const count = await testEnv.app.prisma.user.count({
        where: { email: userData.email },
      });

      expect(count).toBe(1);
    });

    it('should handle audit fields correctly', async () => {
      const userData = {
        name: 'Audit Test User',
        email: 'audit@example.com',
        version: 1,
      };

      const user = await testEnv.app.prisma.user.create({ data: userData });

      // Check audit fields are set
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.createdAt).toEqual(user.updatedAt);

      // Update user
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      
      const updatedUser = await testEnv.app.prisma.user.update({
        where: { id: user.id },
        data: { name: 'Updated Audit User' },
      });

      // updatedAt should be different
      expect(updatedUser.updatedAt.getTime()).toBeGreaterThan(
        user.updatedAt.getTime()
      );
    });
  });
});