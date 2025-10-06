import request from 'supertest';
import jwt from 'jsonwebtoken';
import { IntegrationTestSetup, TestEnvironment } from './setup';

// Helper function to create valid JWT tokens for testing
function createValidToken(payload: any = {}): string {
  const defaultPayload = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin', // Need admin role for the API endpoints
    ...payload
  };
  
  const secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
  return jwt.sign(defaultPayload, secret, { expiresIn: '1h' });
}

describe('Controller Layer Integration Tests', () => {
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
    await testEnv.app.prisma.eventLog.deleteMany({});
    await testEnv.app.prisma.outboxEvent.deleteMany({});
    await testEnv.app.prisma.user.deleteMany({});
  });

  describe('UserController Business Logic Integration', () => {
    it('should handle complete user creation workflow', async () => {
      const token = createValidToken();
      const userData = {
        name: 'Controller Test User',
        email: 'controller@example.com',
      };

      const response = await request(testEnv.app.server)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .send(userData)
        .expect(202); // Async operation

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Object),
        timestamp: expect.any(String),
      });

      // Should include metadata about the async operation
      expect(response.body.meta).toMatchObject({
        message: expect.stringContaining('User creation initiated'),
      });

      // Verify user was actually created in database
      await new Promise(resolve => setTimeout(resolve, 100)); // Allow async processing
      
      const users = await testEnv.app.prisma.user.findMany({});
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe(userData.name);
      expect(users[0].email).toBe(userData.email);

      // Verify events were created
      const events = await testEnv.app.prisma.eventLog.findMany({});
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].eventType).toBe('UserCreated');
    });

    it('should handle user retrieval with proper error handling', async () => {
      // Test retrieving non-existent user
      await request(testEnv.app.server)
        .get('/api/v1/users/non-existent-id')
        .expect(404);

      // Create a user first
      const userData = {
        name: 'Retrieval Test User',
        email: 'retrieval@example.com',
      };

      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(202);

      // Allow async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the created user ID
      const users = await testEnv.app.prisma.user.findMany({});
      const userId = users[0].id;

      // Test successful retrieval
      const response = await request(testEnv.app.server)
        .get(`/api/v1/users/${userId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: userId,
        name: userData.name,
        email: userData.email,
      });
    });

    it('should handle user list with pagination and filtering', async () => {
      // Create multiple users
      const users = [
        { name: 'List User 1', email: 'list1@example.com' },
        { name: 'List User 2', email: 'list2@example.com' },
        { name: 'List User 3', email: 'list3@example.com' },
      ];

      for (const userData of users) {
        await request(testEnv.app.server)
          .post('/api/v1/users')
          .send(userData)
          .expect(202);
      }

      // Allow async processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Test pagination
      const firstPageResponse = await request(testEnv.app.server)
        .get('/api/v1/users?page=1&limit=2')
        .expect(200);

      expect(firstPageResponse.body.users).toHaveLength(2);
      expect(firstPageResponse.body.total).toBe(3);
      expect(firstPageResponse.body.page).toBe(1);
      expect(firstPageResponse.body.limit).toBe(2);

      // Test second page
      const secondPageResponse = await request(testEnv.app.server)
        .get('/api/v1/users?page=2&limit=2')
        .expect(200);

      expect(secondPageResponse.body.users).toHaveLength(1);
      expect(secondPageResponse.body.total).toBe(3);
      expect(secondPageResponse.body.page).toBe(2);
    });

    it('should handle user updates with business logic validation', async () => {
      // Create a user first
      const userData = {
        name: 'Update Test User',
        email: 'update@example.com',
      };

      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(202);

      // Allow async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the created user ID
      const users = await testEnv.app.prisma.user.findMany({});
      const userId = users[0].id;

      // Test successful update
      const updateData = {
        name: 'Updated Controller User',
        email: 'updated@example.com',
      };

      const response = await request(testEnv.app.server)
        .put(`/api/v1/users/${userId}`)
        .send(updateData)
        .expect(202);

      expect(response.body).toMatchObject({
        status: 'accepted',
        message: expect.stringContaining('User update request accepted'),
      });

      // Verify update was applied
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const updatedUsers = await testEnv.app.prisma.user.findMany({});
      expect(updatedUsers[0].name).toBe(updateData.name);
      expect(updatedUsers[0].email).toBe(updateData.email);

      // Verify update event was created
      const events = await testEnv.app.prisma.eventLog.findMany({
        where: { eventType: 'UserUpdated' },
      });
      expect(events.length).toBeGreaterThan(0);
    });

    it('should handle user deletion with soft delete logic', async () => {
      // Create a user first
      const userData = {
        name: 'Delete Test User',
        email: 'delete@example.com',
      };

      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(202);

      // Allow async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the created user ID
      const users = await testEnv.app.prisma.user.findMany({});
      const userId = users[0].id;

      // Test successful deletion
      const response = await request(testEnv.app.server)
        .delete(`/api/v1/users/${userId}`)
        .expect(202);

      expect(response.body).toMatchObject({
        status: 'accepted',
        message: expect.stringContaining('User deletion request accepted'),
      });

      // Verify user was soft deleted
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should not appear in normal user list
      const activeUsers = await request(testEnv.app.server)
        .get('/api/v1/users')
        .expect(200);

      expect(activeUsers.body.users).toHaveLength(0);

      // But should still exist in database with deletedAt set
      const allUsers = await testEnv.app.prisma.user.findMany({});
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0].deletedAt).not.toBeNull();

      // Verify deletion event was created
      const events = await testEnv.app.prisma.eventLog.findMany({
        where: { eventType: 'UserDeleted' },
      });
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Controller Error Handling Integration', () => {
    it('should handle validation errors with proper responses', async () => {
      // Test missing name
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send({ email: 'validation@example.com' })
        .expect(400);

      // Test missing email
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send({ name: 'Validation User' })
        .expect(400);

      // Test invalid email format
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send({ name: 'Invalid Email User', email: 'not-an-email' })
        .expect(400);

      // Test empty name
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send({ name: '', email: 'empty@example.com' })
        .expect(400);
    });

    it('should handle duplicate email errors', async () => {
      const userData = {
        name: 'Duplicate Test User',
        email: 'duplicate@example.com',
      };

      // Create first user
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(202);

      // Allow async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Attempt to create duplicate
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(409); // Conflict
    });

    it('should handle non-existent user operations', async () => {
      const nonExistentId = 'non-existent-user-id';

      // Test update non-existent user
      await request(testEnv.app.server)
        .put(`/api/v1/users/${nonExistentId}`)
        .send({ name: 'Updated Name', email: 'updated@example.com' })
        .expect(404);

      // Test delete non-existent user
      await request(testEnv.app.server)
        .delete(`/api/v1/users/${nonExistentId}`)
        .expect(404);

      // Test get non-existent user
      await request(testEnv.app.server)
        .get(`/api/v1/users/${nonExistentId}`)
        .expect(404);
    });

    it('should handle malformed request data', async () => {
      // Test invalid JSON
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send('invalid-json')
        .set('Content-Type', 'application/json')
        .expect(400);

      // Test wrong data types
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send({ name: 123, email: true })
        .expect(400);
    });

    it('should handle concurrent modification conflicts', async () => {
      // Create a user first
      const userData = {
        name: 'Concurrent Test User',
        email: 'concurrent@example.com',
      };

      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(202);

      // Allow async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the created user ID
      const users = await testEnv.app.prisma.user.findMany({});
      const userId = users[0].id;

      // Perform concurrent updates (simulate optimistic locking conflicts)
      const updatePromises = [
        request(testEnv.app.server)
          .put(`/api/v1/users/${userId}`)
          .send({ name: 'Concurrent Update 1', email: 'concurrent1@example.com' }),
        request(testEnv.app.server)
          .put(`/api/v1/users/${userId}`)
          .send({ name: 'Concurrent Update 2', email: 'concurrent2@example.com' }),
      ];

      const results = await Promise.allSettled(updatePromises);
      
      // Both requests should be accepted (they handle conflicts internally)
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          expect([202, 409]).toContain(result.value.status);
        }
      });
    });
  });

  describe('Controller Performance and Scalability', () => {
    it('should handle bulk operations efficiently', async () => {
      const bulkUsers = Array.from({ length: 50 }, (_, i) => ({
        name: `Bulk User ${i + 1}`,
        email: `bulk${i + 1}@example.com`,
      }));

      const startTime = Date.now();

      // Create users concurrently
      const createPromises = bulkUsers.map(userData =>
        request(testEnv.app.server)
          .post('/api/v1/users')
          .send(userData)
          .expect(202)
      );

      await Promise.all(createPromises);
      const creationTime = Date.now() - startTime;

      expect(creationTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Allow async processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify all users were created
      const response = await request(testEnv.app.server)
        .get('/api/v1/users?limit=100')
        .expect(200);

      expect(response.body.users.length).toBeGreaterThan(40); // Allow for some async timing
    });

    it('should handle high-frequency read operations', async () => {
      // Create some test data first
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send({ name: 'Performance User', email: 'performance@example.com' })
        .expect(202);

      // Allow async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const startTime = Date.now();

      // Perform concurrent read operations
      const readPromises = Array.from({ length: 20 }, () =>
        request(testEnv.app.server)
          .get('/api/v1/users')
          .expect(200)
      );

      const results = await Promise.all(readPromises);
      const readTime = Date.now() - startTime;

      expect(readTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(results).toHaveLength(20);

      // All responses should be consistent
      results.forEach(result => {
        expect(result.body.users).toBeDefined();
        expect(result.body.total).toBeDefined();
      });
    });

    it('should handle pagination with large datasets efficiently', async () => {
      // Create enough users for meaningful pagination
      const users = Array.from({ length: 100 }, (_, i) => ({
        name: `Pagination User ${i + 1}`,
        email: `pagination${i + 1}@example.com`,
      }));

      // Create users in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await Promise.all(
          batch.map(userData =>
            request(testEnv.app.server)
              .post('/api/v1/users')
              .send(userData)
              .expect(202)
          )
        );
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Allow all async processing to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      const startTime = Date.now();

      // Test various pagination scenarios
      const paginationTests = [
        request(testEnv.app.server).get('/api/v1/users?page=1&limit=10'),
        request(testEnv.app.server).get('/api/v1/users?page=5&limit=20'),
        request(testEnv.app.server).get('/api/v1/users?page=10&limit=10'),
      ];

      const results = await Promise.all(paginationTests);
      const paginationTime = Date.now() - startTime;

      expect(paginationTime).toBeLessThan(1000); // Should be fast

      // Verify pagination works correctly
      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body.users).toBeDefined();
        expect(result.body.total).toBeGreaterThan(80); // Account for async timing
        expect(result.body.page).toBeDefined();
        expect(result.body.limit).toBeDefined();
      });
    });
  });

  describe('Controller Integration with Business Layer', () => {
    it('should integrate properly with use cases and domain logic', async () => {
      const userData = {
        name: 'Business Logic User',
        email: 'business@example.com',
      };

      // Create user through controller
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(202);

      // Allow async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify business logic was executed
      const users = await testEnv.app.prisma.user.findMany({});
      expect(users).toHaveLength(1);

      // Verify domain invariants are maintained
      const user = users[0];
      expect(user.version).toBe(1);
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.email).toBe(userData.email.toLowerCase()); // Email normalization

      // Verify events were properly generated
      const events = await testEnv.app.prisma.eventLog.findMany({});
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].aggregateId).toBe(user.id);
      expect(events[0].eventType).toBe('UserCreated');
    });

    it('should handle complex business workflows', async () => {
      // Create user
      const userData = {
        name: 'Workflow User',
        email: 'workflow@example.com',
      };

      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(202);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Get user ID
      const users = await testEnv.app.prisma.user.findMany({});
      const userId = users[0].id;

      // Update user (should increment version)
      await request(testEnv.app.server)
        .put(`/api/v1/users/${userId}`)
        .send({ name: 'Updated Workflow User', email: 'updated-workflow@example.com' })
        .expect(202);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Delete user (should soft delete)
      await request(testEnv.app.server)
        .delete(`/api/v1/users/${userId}`)
        .expect(202);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the complete workflow
      const finalUsers = await testEnv.app.prisma.user.findMany({});
      expect(finalUsers).toHaveLength(1);
      expect(finalUsers[0].deletedAt).not.toBeNull();
      expect(finalUsers[0].version).toBeGreaterThan(1);

      // Verify all events were created
      const events = await testEnv.app.prisma.eventLog.findMany({
        orderBy: { eventVersion: 'asc' },
      });

      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events[0].eventType).toBe('UserCreated');
      expect(events[1].eventType).toBe('UserUpdated');
      expect(events[2].eventType).toBe('UserDeleted');
    });

    it('should maintain data consistency across operations', async () => {
      const userData = {
        name: 'Consistency User',
        email: 'consistency@example.com',
      };

      // Create user
      await request(testEnv.app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(202);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify consistency between database and events
      const users = await testEnv.app.prisma.user.findMany({});
      const events = await testEnv.app.prisma.eventLog.findMany({});

      expect(users).toHaveLength(1);
      expect(events.length).toBeGreaterThan(0);

      // Event data should match user data
      const user = users[0];
      const createdEvent = events.find(e => e.eventType === 'UserCreated');
      
      expect(createdEvent).toBeDefined();
      expect(createdEvent!.aggregateId).toBe(user.id);
      
      const eventData = createdEvent!.eventData as any;
      expect(eventData.email).toBe(user.email);
      expect(eventData.name).toBe(user.name);
    });
  });
});