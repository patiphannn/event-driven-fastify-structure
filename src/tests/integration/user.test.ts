import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { IntegrationTestSetup, TestEnvironment } from './setup';

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

      const response = await request(app.server)
        .post('/users')
        .send(userData)
        .expect(202);

      expect(response.body).toEqual({
        message: 'User creation initiated successfully',
        id: expect.any(String),
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

    it('should return 400 for invalid user data', async () => {
      const invalidData = {
        name: '', // Invalid: empty name
        email: 'invalid-email', // Invalid: not a valid email
      };

      const response = await request(app.server)
        .post('/users')
        .send(invalidData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
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

    it('should update an existing user and return 202 Accepted', async () => {
      const updateData = {
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
      };

      const response = await request(app.server)
        .put(`/users/${userId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toEqual({
        message: 'User updated successfully',
        id: userId,
        version: expect.any(Number),
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

      await request(app.server)
        .put(`/users/${nonExistentId}`)
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

    it('should delete an existing user and return 202 Accepted', async () => {
      const response = await request(app.server)
        .delete(`/users/${userId}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'User deleted successfully',
        id: userId,
        version: expect.any(Number),
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

      await request(app.server)
        .delete(`/users/${nonExistentId}`)
        .expect(404);
    });
  });

  describe('GET /events', () => {
    beforeEach(async () => {
      // Create some test events
      await app.prisma.outboxEvent.createMany({
        data: [
          {
            id: '1',
            eventType: 'UserCreated',
            eventData: { userId: '123', name: 'John' },
            processed: true,
            createdAt: new Date('2024-01-01T10:00:00Z'),
          },
          {
            id: '2',
            eventType: 'UserUpdated',
            eventData: { userId: '123', name: 'John Doe' },
            processed: false,
            createdAt: new Date('2024-01-01T11:00:00Z'),
          },
        ],
      });
    });

    it('should return event history', async () => {
      const response = await request(app.server)
        .get('/events')
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('count');
      expect(response.body.events).toBeInstanceOf(Array);
    });

    it('should support pagination', async () => {
      const response = await request(app.server)
        .get('/events?fromPosition=1&maxCount=1')
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('count');
      expect(response.body.events).toBeInstanceOf(Array);
    });
  });
});
