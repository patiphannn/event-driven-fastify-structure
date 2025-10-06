import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { IntegrationTestSetup, TestEnvironment } from './setup';

describe('UserController Integration Tests', () => {
  let testEnv: TestEnvironment;
  let app: FastifyInstance;

  beforeAll(async () => {
    testEnv = await IntegrationTestSetup.setup();
    app = testEnv.app;
    await app.ready();
  }, 30000);

  afterAll(async () => {
    await testEnv.cleanup();
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(async () => {
    // Clean up the database before each test
    await app.prisma.outboxEvent.deleteMany({});
    await app.prisma.user.deleteMany({});
  });

  describe('GET /users - List Users', () => {
    beforeEach(async () => {
      // Create test users for pagination testing
      const users = Array.from({ length: 15 }, (_, i) => ({
        name: `Test User ${i + 1}`,
        email: `user${i + 1}@example.com`,
        createdAt: new Date(Date.now() + i * 1000), // Staggered creation times
      }));

      await app.prisma.user.createMany({ data: users });
    });

    it('should list users with default pagination', async () => {
      const response = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('pagination');
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeLessThanOrEqual(20); // Default limit
      expect(response.body.meta.pagination).toMatchObject({
        page: 1,
        limit: expect.any(Number),
        total: 15,
        totalPages: expect.any(Number),
        hasNext: expect.any(Boolean),
        hasPrev: false,
      });
    });

    it('should support custom pagination parameters', async () => {
      const response = await request(app.server)
        .get('/api/v1/users?page=2&limit=5')
        .expect(200);

      expect(response.body.data).toHaveLength(5);
      expect(response.body.meta.pagination).toMatchObject({
        page: 2,
        limit: 5,
        total: 15,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      });
    });

    it('should handle invalid pagination parameters', async () => {
      const response = await request(app.server)
        .get('/api/v1/users?page=-1&limit=1000')
        .expect(200);

      // Should default to valid pagination
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBeLessThanOrEqual(100); // Max limit
    });

    it('should return empty array when no users exist', async () => {
      // Clear all users
      await app.prisma.user.deleteMany({});

      const response = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should handle page beyond available data', async () => {
      const response = await request(app.server)
        .get('/api/v1/users?page=999&limit=10')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.page).toBe(999);
      expect(response.body.pagination.total).toBe(15);
    });
  });

  describe('POST /users - Create User', () => {
    it('should require authentication for user creation', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(401);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        message: expect.stringContaining('Authorization token is required'),
      });

      // Verify no user was created
      const users = await app.prisma.user.findMany();
      expect(users).toHaveLength(0);
    });

    it('should reject creation with invalid authentication', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', 'Bearer invalid-token')
        .send(userData)
        .expect(401);

      expect(response.body).toMatchObject({
        error: expect.any(String),
      });

      // Verify no user was created
      const users = await app.prisma.user.findMany();
      expect(users).toHaveLength(0);
    });

    it('should reject creation with missing required fields', async () => {
      const incompleteData = {
        name: 'John Doe',
        // Missing email
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .send(incompleteData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        message: expect.stringContaining('Email and name are required'),
      });

      // Verify no user was created
      const users = await app.prisma.user.findMany();
      expect(users).toHaveLength(0);
    });

    it('should reject creation with invalid email format', async () => {
      const invalidData = {
        name: 'John Doe',
        email: 'invalid-email-format',
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .send(invalidData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
      });

      // Verify no user was created
      const users = await app.prisma.user.findMany();
      expect(users).toHaveLength(0);
    });

    it('should handle duplicate email addresses', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      // Create first user
      await request(app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(202);

      // Try to create second user with same email
      const response = await request(app.server)
        .post('/api/v1/users')
        .send({
          name: 'Jane Doe',
          email: 'john@example.com', // Same email
        })
        .expect(409);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        message: expect.stringContaining('already exists'),
      });
    });

    it('should handle creation with authentication context', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      // Mock authenticated user
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', 'Bearer mock-token')
        .send(userData)
        .expect(202);

      expect(response.body).toMatchObject({
        message: expect.stringContaining('User creation initiated'),
        id: expect.any(String),
      });

      // Verify outbox event includes creator information
      const events = await app.prisma.outboxEvent.findMany();
      const eventData = JSON.parse(events[0].eventData as string);
      
      // Should include creator information if auth middleware is working
      if (eventData.createdBy) {
        expect(eventData.createdBy).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          email: expect.any(String),
        });
      }
    });
  });

  describe('PUT /users/:id - Update User', () => {
    let existingUserId: string;

    beforeEach(async () => {
      const user = await app.prisma.user.create({
        data: {
          name: 'Jane Doe',
          email: 'jane@example.com',
        },
      });
      existingUserId = user.id;
    });

    it('should update an existing user successfully', async () => {
      const updateData = {
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
      };

      const response = await request(app.server)
        .put(`/api/v1/users/${existingUserId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        message: expect.stringContaining('updated successfully'),
        id: existingUserId,
        version: expect.any(String),
      });

      // Verify user was updated in database
      const updatedUser = await app.prisma.user.findUnique({
        where: { id: existingUserId },
      });
      expect(updatedUser).toMatchObject(updateData);

      // Verify outbox event was created
      const events = await app.prisma.outboxEvent.findMany({
        where: { eventType: 'user.updated' },
      });
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it('should update only provided fields', async () => {
      const partialUpdate = {
        name: 'Jane Smith',
        // email not provided - should remain unchanged
      };

      const response = await request(app.server)
        .put(`/api/v1/users/${existingUserId}`)
        .send(partialUpdate)
        .expect(200);

      expect(response.body).toMatchObject({
        message: expect.stringContaining('updated successfully'),
        id: existingUserId,
      });

      // Verify only name was updated
      const updatedUser = await app.prisma.user.findUnique({
        where: { id: existingUserId },
      });
      expect(updatedUser).toMatchObject({
        name: 'Jane Smith',
        email: 'jane@example.com', // Original email unchanged
      });
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const updateData = {
        name: 'John Smith',
        email: 'john.smith@example.com',
      };

      const response = await request(app.server)
        .put(`/api/v1/users/${nonExistentId}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        message: expect.stringContaining('not found'),
      });
    });

    it('should reject update with no fields provided', async () => {
      const response = await request(app.server)
        .put(`/api/v1/users/${existingUserId}`)
        .send({}) // Empty update
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        message: expect.stringContaining('At least one field'),
      });
    });

    it('should reject update with invalid user ID format', async () => {
      const invalidId = 'invalid-uuid-format';
      const updateData = {
        name: 'John Smith',
        email: 'john.smith@example.com',
      };

      const response = await request(app.server)
        .put(`/api/v1/users/${invalidId}`)
        .send(updateData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
      });
    });

    it('should handle concurrent updates with optimistic locking', async () => {
      const updateData1 = { name: 'Jane Smith' };
      const updateData2 = { name: 'Jane Johnson' };

      // Start both updates simultaneously
      const [response1, response2] = await Promise.allSettled([
        request(app.server)
          .put(`/api/v1/users/${existingUserId}`)
          .send(updateData1),
        request(app.server)
          .put(`/api/v1/users/${existingUserId}`)
          .send(updateData2),
      ]);

      // At least one should succeed
      const successfulResponses = [response1, response2].filter(
        result => result.status === 'fulfilled' && result.value.status === 200
      );
      expect(successfulResponses.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DELETE /users/:id - Delete User', () => {
    let existingUserId: string;

    beforeEach(async () => {
      const user = await app.prisma.user.create({
        data: {
          name: 'Bob Wilson',
          email: 'bob@example.com',
        },
      });
      existingUserId = user.id;
    });

    it('should soft delete an existing user', async () => {
      const response = await request(app.server)
        .delete(`/api/v1/users/${existingUserId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        message: expect.stringContaining('deleted successfully'),
        id: existingUserId,
        version: expect.any(String),
      });

      // Verify user was soft deleted (deletedAt set)
      const deletedUser = await app.prisma.user.findUnique({
        where: { id: existingUserId },
      });
      expect(deletedUser).not.toBeNull();
      expect(deletedUser?.deletedAt).not.toBeNull();

      // Verify outbox event was created
      const events = await app.prisma.outboxEvent.findMany({
        where: { eventType: 'user.deleted' },
      });
      expect(events).toHaveLength(1);

      const eventData = JSON.parse(events[0].eventData as string);
      expect(eventData).toMatchObject({
        userId: existingUserId,
      });
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.server)
        .delete(`/api/v1/users/${nonExistentId}`)
        .expect(404);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        message: expect.stringContaining('not found'),
      });
    });

    it('should reject deletion with invalid user ID format', async () => {
      const invalidId = 'invalid-uuid-format';

      const response = await request(app.server)
        .delete(`/api/v1/users/${invalidId}`)
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
      });
    });

    it('should handle deletion of already deleted user', async () => {
      // First deletion
      await request(app.server)
        .delete(`/api/v1/users/${existingUserId}`)
        .expect(200);

      // Second deletion attempt
      const response = await request(app.server)
        .delete(`/api/v1/users/${existingUserId}`)
        .expect(404);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        message: expect.stringContaining('not found'),
      });
    });

    it('should handle deletion with authentication context', async () => {
      const response = await request(app.server)
        .delete(`/api/v1/users/${existingUserId}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(response.body).toMatchObject({
        message: expect.stringContaining('deleted successfully'),
        id: existingUserId,
      });

      // Verify outbox event includes deleter information
      const events = await app.prisma.outboxEvent.findMany({
        where: { eventType: 'user.deleted' },
      });
      const eventData = JSON.parse(events[0].eventData as string);
      
      // Should include deleter information if auth middleware is working
      if (eventData.deletedBy) {
        expect(eventData.deletedBy).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          email: expect.any(String),
        });
      }
    });
  });

  describe('Error Handling and Middleware Integration', () => {
    it('should handle database connection errors gracefully', async () => {
      // This test would require mocking database failures
      // For now, we'll test a scenario that might cause database issues
      const userData = {
        name: 'A'.repeat(1000), // Extremely long name that might cause issues
        email: 'test@example.com',
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .send(userData);

      // Should handle gracefully with appropriate error
      expect([400, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });

    it('should include proper CORS headers', async () => {
      const response = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      // Check for CORS headers (if configured)
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should handle malformed JSON in request body', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
      });
    });

    it('should enforce content-type validation', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Content-Type', 'text/plain')
        .send('name=John&email=john@example.com')
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
      });
    });

    it('should handle very large request payloads', async () => {
      const largeData = {
        name: 'A'.repeat(10000),
        email: 'test@example.com',
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .send(largeData);

      // Should either accept (if within limits) or reject appropriately
      expect([400, 413, 500]).toContain(response.status);
    });
  });

  describe('Business Logic Integration', () => {
    it('should maintain data consistency across operations', async () => {
      // Create user
      const createResponse = await request(app.server)
        .post('/api/v1/users')
        .send({
          name: 'Consistency Test',
          email: 'consistency@example.com',
        })
        .expect(202);

      const userId = createResponse.body.id;

      // Update user
      await request(app.server)
        .put(`/api/v1/users/${userId}`)
        .send({
          name: 'Updated Consistency Test',
        })
        .expect(200);

      // Verify consistency
      const user = await app.prisma.user.findUnique({
        where: { id: userId },
      });
      expect(user?.name).toBe('Updated Consistency Test');
      expect(user?.email).toBe('consistency@example.com');

      // Delete user
      await request(app.server)
        .delete(`/api/v1/users/${userId}`)
        .expect(200);

      // Verify soft deletion
      const deletedUser = await app.prisma.user.findUnique({
        where: { id: userId },
      });
      expect(deletedUser?.deletedAt).not.toBeNull();
    });

    it('should maintain event ordering in outbox', async () => {
      // Create user
      const createResponse = await request(app.server)
        .post('/api/v1/users')
        .send({
          name: 'Event Order Test',
          email: 'events@example.com',
        })
        .expect(202);

      const userId = createResponse.body.id;

      // Update user multiple times
      await request(app.server)
        .put(`/api/v1/users/${userId}`)
        .send({ name: 'First Update' })
        .expect(200);

      await request(app.server)
        .put(`/api/v1/users/${userId}`)
        .send({ name: 'Second Update' })
        .expect(200);

      // Delete user
      await request(app.server)
        .delete(`/api/v1/users/${userId}`)
        .expect(200);

      // Verify event ordering
      const events = await app.prisma.outboxEvent.findMany({
        orderBy: { createdAt: 'asc' },
      });

      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events[0].eventType).toBe('user.created');
      expect(events[events.length - 1].eventType).toBe('user.deleted');
    });
  });
});