import { IntegrationTestSetup, TestEnvironment } from './setup';
import { PrismaUnitOfWork } from '../../infrastructure/database/PrismaUnitOfWork';

describe('Infrastructure Integration Tests', () => {
  let testEnv: TestEnvironment;
  let unitOfWork: PrismaUnitOfWork;

  beforeAll(async () => {
    testEnv = await IntegrationTestSetup.setup();
    unitOfWork = new PrismaUnitOfWork();
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

  describe('Database Client Integration', () => {
    it('should establish database connection successfully', async () => {
      expect(testEnv.app.prisma).toBeDefined();
      
      // Test basic database connectivity
      const result = await testEnv.app.prisma.$queryRaw`SELECT 1 as test`;
      expect(result).toBeDefined();
    });

    it('should handle database transactions properly', async () => {
      const userData = {
        name: 'Transaction Test User',
        email: 'transaction@example.com',
        version: 1,
      };

      // Test successful transaction
      const result = await testEnv.app.prisma.$transaction(async (prisma) => {
        const user = await prisma.user.create({ data: userData });
        
        // Verify user was created within transaction
        const foundUser = await prisma.user.findUnique({
          where: { id: user.id }
        });
        
        expect(foundUser).toBeDefined();
        expect(foundUser?.email).toBe(userData.email);
        
        return user;
      });

      expect(result).toBeDefined();
      expect(result.email).toBe(userData.email);

      // Verify user exists after transaction
      const userAfterTransaction = await testEnv.app.prisma.user.findUnique({
        where: { id: result.id }
      });
      expect(userAfterTransaction).toBeDefined();
    });

    it('should handle database connection resilience', async () => {
      // Test multiple concurrent database operations
      const operations = Array.from({ length: 5 }, (_, i) =>
        testEnv.app.prisma.user.create({
          data: {
            name: `Concurrent User ${i}`,
            email: `concurrent${i}@example.com`,
            version: 1,
          },
        })
      );

      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(5);
      results.forEach((user, index) => {
        expect(user.name).toBe(`Concurrent User ${index}`);
        expect(user.email).toBe(`concurrent${index}@example.com`);
      });
    });

    it('should handle database query optimization', async () => {
      // Create test data
      const users = Array.from({ length: 10 }, (_, i) => ({
        name: `Performance User ${i}`,
        email: `perf${i}@example.com`,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await testEnv.app.prisma.user.createMany({ data: users });

      // Test efficient queries
      const startTime = Date.now();
      const foundUsers = await testEnv.app.prisma.user.findMany({
        where: {
          email: {
            contains: 'perf',
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      });

      const queryTime = Date.now() - startTime;
      
      expect(foundUsers).toHaveLength(5);
      expect(queryTime).toBeLessThan(100); // Should be fast for small dataset
    });
  });

  describe('Unit of Work Integration', () => {
    it('should handle transactional operations', async () => {
      const userData = {
        name: 'UoW Test User',
        email: 'uow@example.com',
        version: 1,
      };

      await unitOfWork.execute(async () => {
        const user = await testEnv.app.prisma.user.create({ data: userData });
        
        // Verify within transaction
        const foundUser = await testEnv.app.prisma.user.findUnique({
          where: { id: user.id }
        });
        expect(foundUser).toBeDefined();
        
        return user;
      });

      // Verify after transaction
      const userAfterTransaction = await testEnv.app.prisma.user.findFirst({
        where: { email: userData.email }
      });
      expect(userAfterTransaction).toBeDefined();
      expect(userAfterTransaction?.name).toBe(userData.name);
    });

    it('should handle transaction rollback on errors', async () => {
      const userData = {
        name: 'Rollback Test User',
        email: 'rollback@example.com',
        version: 1,
      };

      try {
        await unitOfWork.execute(async () => {
          await testEnv.app.prisma.user.create({ data: userData });
          
          // Force an error to trigger rollback
          throw new Error('Intentional error for rollback test');
        });
      } catch (error: any) {
        expect(error.message).toBe('Intentional error for rollback test');
      }

      // Verify user was not created due to rollback
      const userAfterRollback = await testEnv.app.prisma.user.findFirst({
        where: { email: userData.email }
      });
      expect(userAfterRollback).toBeNull();
    });

    it('should handle nested transactions properly', async () => {
      const userData1 = {
        name: 'Nested Test User 1',
        email: 'nested1@example.com',
        version: 1,
      };

      const userData2 = {
        name: 'Nested Test User 2',
        email: 'nested2@example.com',
        version: 1,
      };

      const result = await unitOfWork.execute(async () => {
        const user1 = await testEnv.app.prisma.user.create({ data: userData1 });
        
        // Nested operation
        const user2 = await testEnv.app.prisma.user.create({ data: userData2 });
        
        // Verify both users exist within transaction
        const users = await testEnv.app.prisma.user.findMany({
          where: {
            email: {
              in: [userData1.email, userData2.email]
            }
          }
        });
        
        expect(users).toHaveLength(2);
        
        return { user1, user2 };
      });

      expect(result.user1.email).toBe(userData1.email);
      expect(result.user2.email).toBe(userData2.email);

      // Verify both users exist after transaction
      const usersAfterTransaction = await testEnv.app.prisma.user.findMany({
        where: {
          email: {
            in: [userData1.email, userData2.email]
          }
        }
      });
      expect(usersAfterTransaction).toHaveLength(2);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle database unavailability gracefully', async () => {
      // This test simulates what happens during database connectivity issues
      try {
        // Attempt an operation that might fail
        await testEnv.app.prisma.$queryRaw`SELECT * FROM non_existent_table`;
      } catch (error: any) {
        // Should be a database error
        expect(error).toBeDefined();
        expect(error.message).toContain('relation "non_existent_table" does not exist');
      }
    });

    it('should handle high load scenarios', async () => {
      // Create multiple operations to simulate load
      const operations = Array.from({ length: 20 }, (_, i) =>
        testEnv.app.prisma.user.create({
          data: {
            name: `Load Test User ${i}`,
            email: `load${i}@example.com`,
            version: 1,
          },
        })
      );

      // Execute all operations concurrently
      const startTime = Date.now();
      
      const dbResults = await Promise.all(operations);
      
      const totalTime = Date.now() - startTime;

      // Verify all operations completed
      expect(dbResults).toHaveLength(20);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should maintain data consistency under concurrent access', async () => {
      const baseEmail = 'consistency-test';
      
      // Create multiple concurrent user creation operations
      const userCreations = Array.from({ length: 10 }, (_, i) =>
        testEnv.app.prisma.user.create({
          data: {
            name: `Consistency User ${i}`,
            email: `${baseEmail}${i}@example.com`,
            version: 1,
          },
        })
      );

      const users = await Promise.all(userCreations);
      
      // Verify all users were created with unique IDs
      const userIds = users.map(user => user.id);
      const uniqueIds = new Set(userIds);
      expect(uniqueIds.size).toBe(userIds.length);

      // Verify all users can be retrieved
      const retrievedUsers = await testEnv.app.prisma.user.findMany({
        where: {
          email: {
            contains: baseEmail
          }
        }
      });

      expect(retrievedUsers).toHaveLength(10);
    });

    it('should handle batch operations efficiently', async () => {
      const batchSize = 50;
      const users = Array.from({ length: batchSize }, (_, i) => ({
        name: `Batch User ${i}`,
        email: `batch${i}@example.com`,
        version: 1,
      }));

      const startTime = Date.now();
      
      // Use batch insert for efficiency
      const result = await testEnv.app.prisma.user.createMany({
        data: users,
        skipDuplicates: true,
      });

      const batchTime = Date.now() - startTime;

      expect(result.count).toBe(batchSize);
      expect(batchTime).toBeLessThan(1000); // Should be fast for batch operations

      // Verify all users were created
      const createdUsers = await testEnv.app.prisma.user.findMany({
        where: {
          email: {
            contains: 'batch'
          }
        }
      });

      expect(createdUsers).toHaveLength(batchSize);
    });
  });

  describe('Database Schema and Constraints', () => {
    it('should enforce unique email constraints', async () => {
      const userData = {
        name: 'Unique Test User',
        email: 'unique@example.com',
        version: 1,
      };

      // Create first user
      await testEnv.app.prisma.user.create({ data: userData });

      // Attempt to create second user with same email
      await expect(
        testEnv.app.prisma.user.create({ data: userData })
      ).rejects.toThrow();
    });

    it('should handle version field for optimistic locking', async () => {
      const userData = {
        name: 'Version Test User',
        email: 'version@example.com',
        version: 1,
      };

      const user = await testEnv.app.prisma.user.create({ data: userData });
      expect(user.version).toBe(1);

      // Update should increment version
      const updatedUser = await testEnv.app.prisma.user.update({
        where: { id: user.id },
        data: { 
          name: 'Updated Name',
          version: user.version + 1
        },
      });

      expect(updatedUser.version).toBe(2);
      expect(updatedUser.name).toBe('Updated Name');
    });

    it('should handle soft delete functionality', async () => {
      const userData = {
        name: 'Soft Delete User',
        email: 'softdelete@example.com',
        version: 1,
      };

      const user = await testEnv.app.prisma.user.create({ data: userData });

      // Soft delete by setting deletedAt
      const deletedUser = await testEnv.app.prisma.user.update({
        where: { id: user.id },
        data: { 
          deletedAt: new Date()
        },
      });

      expect(deletedUser.deletedAt).toBeDefined();

      // User should still exist in database but marked as deleted
      const foundUser = await testEnv.app.prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(foundUser).toBeDefined();
      expect(foundUser?.deletedAt).toBeDefined();
    });
  });
});