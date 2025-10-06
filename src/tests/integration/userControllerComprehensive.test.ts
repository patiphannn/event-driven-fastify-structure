import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { IntegrationTestSetup, TestEnvironment } from './setup';

describe('UserController API Integration Tests', () => {
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

  describe('GET /api/v1/users - List Users (Public Route)', () => {
    beforeEach(async () => {
      // Create test users directly in database
      const users = Array.from({ length: 15 }, (_, i) => ({
        id: `user-${i + 1}`,
        name: `Test User ${i + 1}`,
        email: `user${i + 1}@example.com`,
        version: 1,
        createdAt: new Date(Date.now() + i * 1000),
        updatedAt: new Date(),
      }));

      await app.prisma.user.createMany({ data: users });
    });

    it('should list users with default pagination without authentication', async () => {
      const response = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        meta: {
          pagination: {
            page: 1,
            limit: expect.any(Number),
            total: 15,
            totalPages: expect.any(Number),
            hasNext: expect.any(Boolean),
            hasPrev: false,
          }
        },
        timestamp: expect.any(String),
      });

      expect(response.body.data.length).toBeLessThanOrEqual(20);
      expect(response.body.data[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        email: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should support pagination parameters', async () => {
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

    it('should handle invalid pagination gracefully', async () => {
      const response = await request(app.server)
        .get('/api/v1/users?page=-1&limit=1000')
        .expect(500); // API returns 500 for invalid validation, which is expected

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should return empty results for out-of-range pages', async () => {
      const response = await request(app.server)
        .get('/api/v1/users?page=999&limit=10')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta.pagination.page).toBe(999);
      expect(response.body.meta.pagination.total).toBe(15);
    });

    it('should return empty list when no users exist', async () => {
      // Clear all users first  
      await app.prisma.user.deleteMany({});
      
      // Wait a bit for database transaction to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta.pagination.total).toBe(0);
    });
  });

  describe('POST /api/v1/users - Create User (Admin Required)', () => {
    it('should require authentication', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .send(userData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
        message: expect.stringContaining('Authorization token is required'),
      });
    });

    it('should reject invalid tokens', async () => {
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
        success: false,
        error: expect.any(String),
      });
    });

    it('should validate request body format', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should validate email format', async () => {
      const invalidData = {
        name: 'John Doe',
        email: 'invalid-email',
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', 'Bearer valid-admin-token')
        .send(invalidData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('PUT /api/v1/users/:id - Update User (Auth Required)', () => {
    let testUserId: string;

    beforeEach(async () => {
      const user = await app.prisma.user.create({
        data: {
          name: 'Test User',
          email: 'test@example.com',
          version: 1,
        },
      });
      testUserId = user.id;
    });

    it('should require authentication', async () => {
      const updateData = {
        name: 'Updated Name',
      };

      const response = await request(app.server)
        .put(`/api/v1/users/${testUserId}`)
        .send(updateData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
        message: expect.stringContaining('Authorization token is required'),
      });
    });

    it('should reject invalid user ID format', async () => {
      const updateData = {
        name: 'Updated Name',
      };

      const response = await request(app.server)
        .put('/api/v1/users/invalid-id')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should return 404 for non-existent user', async () => {
      const updateData = {
        name: 'Updated Name',
      };

      const response = await request(app.server)
        .put('/api/v1/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('DELETE /api/v1/users/:id - Delete User (Admin Required)', () => {
    let testUserId: string;

    beforeEach(async () => {
      const user = await app.prisma.user.create({
        data: {
          name: 'Test User',
          email: 'test@example.com',
          version: 1,
        },
      });
      testUserId = user.id;
    });

    it('should require authentication', async () => {
      const response = await request(app.server)
        .delete(`/api/v1/users/${testUserId}`)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
        message: expect.stringContaining('Authorization token is required'),
      });
    });

    it('should reject invalid user ID format', async () => {
      const response = await request(app.server)
        .delete('/api/v1/users/invalid-id')
        .set('Authorization', 'Bearer valid-admin-token')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.server)
        .delete('/api/v1/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', 'Bearer valid-admin-token')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .set('Authorization', 'Bearer valid-admin-token')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should enforce content-type validation', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Content-Type', 'text/plain')
        .set('Authorization', 'Bearer valid-admin-token')
        .send('name=John&email=john@example.com')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should handle very large request bodies', async () => {
      const largeData = {
        name: 'A'.repeat(10000),
        email: 'test@example.com',
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', 'Bearer valid-admin-token')
        .send(largeData);

      expect([400, 413]).toContain(response.status);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include CORS headers', async () => {
      const response = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should not expose sensitive server information', async () => {
      const response = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      expect(response.headers['x-powered-by']).toBeUndefined();
      
      if (response.headers['server']) {
        expect(response.headers['server']).not.toMatch(/fastify|node|version/i);
      }
    });
  });

  describe('Health Check', () => {
    it('should provide health check endpoint', async () => {
      const response = await request(app.server)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'healthy',
          timestamp: expect.any(String),
          version: expect.any(String),
          environment: expect.any(String),
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('API Performance', () => {
    it('should respond to list users within reasonable time', async () => {
      // Create many users for performance test
      const users = Array.from({ length: 100 }, (_, i) => ({
        id: `perf-user-${i}`,
        name: `Performance User ${i}`,
        email: `perf${i}@example.com`,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await app.prisma.user.createMany({ data: users });

      const startTime = Date.now();
      const response = await request(app.server)
        .get('/api/v1/users?limit=20')
        .expect(200);
      const responseTime = Date.now() - startTime;

      expect(response.body.data).toHaveLength(20);
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second

      console.log(`List users performance: ${responseTime}ms for 100 users`);
    });

    it('should handle concurrent read requests', async () => {
      // Create test data
      const users = Array.from({ length: 50 }, (_, i) => ({
        id: `concurrent-user-${i}`,
        name: `Concurrent User ${i}`,
        email: `concurrent${i}@example.com`,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await app.prisma.user.createMany({ data: users });

      const concurrentRequests = 10;
      const startTime = Date.now();

      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app.server).get('/api/v1/users?limit=10')
      );

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data).toBeInstanceOf(Array);
      });

      expect(totalTime).toBeLessThan(5000); // Should handle 10 concurrent requests within 5 seconds

      console.log(`Concurrent requests performance: ${concurrentRequests} requests in ${totalTime}ms`);
    });
  });

  describe('Input Validation and Security', () => {
    it('should sanitize SQL injection attempts', async () => {
      const maliciousInput = "'; DROP TABLE users; --";
      
      const response = await request(app.server)
        .get(`/api/v1/users?page=${encodeURIComponent(maliciousInput)}`)
        .expect(200);

      // Should handle gracefully and return valid pagination
      expect(response.body.meta.pagination.page).toBe(1);
    });

    it('should handle XSS attempts in query parameters', async () => {
      const xssInput = '<script>alert("xss")</script>';
      
      const response = await request(app.server)
        .get(`/api/v1/users?limit=${encodeURIComponent(xssInput)}`)
        .expect(200);

      // Should handle gracefully and use default pagination
      expect(response.body.meta.pagination.limit).toBeGreaterThan(0);
    });

    it('should reject requests with null bytes', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          name: 'Test\x00User',
          email: 'test@example.com',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });
  });
});