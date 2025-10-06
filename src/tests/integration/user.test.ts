import request from 'supertest';
import jwt from 'jsonwebtoken';
import { FastifyInstance } from 'fastify';
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

describe('User API Integration Tests', () => {
  let testEnv: TestEnvironment;
  let app: FastifyInstance;

  beforeAll(async () => {
    testEnv = await IntegrationTestSetup.setup();
    app = testEnv.app;
    await app.ready();
  }, 30000); // 30 second timeout for container startup

  afterAll(async () => {
    await testEnv.cleanup();
    
    // Force a small delay to allow cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(async () => {
    // Clean up the database before each test
    await app.prisma.outboxEvent.deleteMany({});
    await app.prisma.user.deleteMany({});
  });

  describe('POST /api/users', () => {
    it('should create a new user and return 202 Accepted', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const token = createValidToken();
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .send(userData)
        .expect(202);

      expect(response.body).toEqual({
        success: true,
        data: {
          id: expect.any(String),
          message: 'User creation initiated successfully',
        },
        meta: {
          message: 'User creation initiated',
          estimatedCompletionTime: '< 1 second'
        },
        timestamp: expect.any(String),
        traceId: expect.any(String),
      });

      // Verify user was created in database
      const users = await app.prisma.user.findMany();
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        name: userData.name,
        email: userData.email,
      });

      // Verify outbox event was created
      const events = await app.prisma.outboxEvent.findMany();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: 'user.created',
        processed: false,
      });
    });

    it('should return 500 for invalid user data (schema validation)', async () => {
      const invalidData = {
        name: '', // Invalid: empty name
        email: 'invalid-email', // Invalid: not a valid email
      };

      const token = createValidToken();
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidData)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });

      // Verify no user was created
      const users = await app.prisma.user.findMany();
      expect(users).toHaveLength(0);
    });
  });

  describe('PUT /api/users/:id', () => {
    let userId: string;

    beforeEach(async () => {
      // Create a user for update tests
      const user = await app.prisma.user.create({
        data: {
          name: 'Jane Doe',
          email: 'jane@example.com',
        },
      });
      userId = user.id;
    });

    it('should update an existing user and return 200 OK', async () => {
      const updateData = {
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
      };

      const token = createValidToken();
      const response = await request(app.server)
        .put(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          id: userId,
          message: 'User updated successfully',
          version: expect.any(Number),
        },
        meta: {
          version: expect.any(String),
        },
        timestamp: expect.any(String),
        traceId: expect.any(String),
      });

      // Verify user was updated in database
      const updatedUser = await app.prisma.user.findUnique({
        where: { id: userId },
      });
      expect(updatedUser).toMatchObject(updateData);

      // Verify outbox event was created (can be 1 or 2 events depending on what fields changed)
      const events = await app.prisma.outboxEvent.findMany({
        where: { eventType: 'user.updated' },
      });
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const updateData = {
        name: 'John Smith',
        email: 'john.smith@example.com',
        age: 30,
      };

      const token = createValidToken();
      await request(app.server)
        .put(`/api/v1/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData)
        .expect(404);
    });
  });

  describe('DELETE /api/users/:id', () => {
    let userId: string;

    beforeEach(async () => {
      // Create a user for delete tests
      const user = await app.prisma.user.create({
        data: {
          name: 'Bob Wilson',
          email: 'bob@example.com',
        },
      });
      userId = user.id;
    });

    it('should delete an existing user and return 200 OK', async () => {
      const token = createValidToken();
      const response = await request(app.server)
        .delete(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          id: userId,
          message: 'User deleted successfully',
          version: expect.any(Number),
        },
        meta: {
          version: expect.any(String),
        },
        timestamp: expect.any(String),
        traceId: expect.any(String),
      });

      // Verify user was soft deleted (deletedAt set, not actually removed)
      const deletedUser = await app.prisma.user.findUnique({
        where: { id: userId },
      });
      expect(deletedUser).not.toBeNull();
      expect(deletedUser?.deletedAt).not.toBeNull();

      // Verify outbox event was created
      const events = await app.prisma.outboxEvent.findMany({
        where: { eventType: 'user.deleted' },
      });
      expect(events).toHaveLength(1);
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const token = createValidToken();
      await request(app.server)
        .delete(`/api/v1/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
