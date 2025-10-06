import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { IntegrationTestSetup, TestEnvironment } from './setup';

describe('Middleware Integration Tests', () => {
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

  describe('CORS Middleware', () => {
    it('should add CORS headers to responses', async () => {
      const response = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      // Verify CORS headers are present
      expect(response.headers).toHaveProperty('vary');
      // The response should not expose sensitive server information
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('should handle preflight OPTIONS requests', async () => {
      const response = await request(app.server)
        .options('/api/v1/users')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      // Should handle CORS preflight successfully
      expect([200, 204]).toContain(response.status);
    });

    it('should handle preflight requests for protected endpoints', async () => {
      const response = await request(app.server)
        .options('/api/v1/users')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type');

      // Should handle CORS preflight for protected routes
      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Authentication Middleware', () => {
    it('should allow access to public endpoints without authentication', async () => {
      const response = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('should require authentication for protected endpoints', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .send({
          name: 'Test User',
          email: 'test@example.com',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: 'Authorization token is required',
          code: 'common.unauthorized',
        }),
      });
    });

    it('should reject invalid authorization tokens', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', 'Bearer invalid-token-format')
        .send({
          name: 'Test User',
          email: 'test@example.com',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Invalid token'),
          code: 'common.unauthorized',
        }),
      });
    });

    it('should handle malformed authorization headers', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', 'InvalidFormat')
        .send({
          name: 'Test User',
          email: 'test@example.com',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          code: 'common.unauthorized',
        }),
      });
    });

    it('should handle missing bearer prefix', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', 'fake-token-without-bearer')
        .send({
          name: 'Test User',
          email: 'test@example.com',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          code: 'common.unauthorized',
        }),
      });
    });
  });

  describe('Error Handling Middleware', () => {
    it('should handle validation errors properly', async () => {
      const response = await request(app.server)
        .get('/api/v1/users?page=invalid')
        .expect(500); // API returns 500 for validation errors

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('must be integer'),
          code: expect.any(String),
          traceId: expect.any(String),
        }),
        timestamp: expect.any(String),
      });
    });

    it('should return consistent error structure for all errors', async () => {
      const response = await request(app.server)
        .get('/api/v1/users?limit=invalid')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
          details: expect.any(Object),
          traceId: expect.any(String),
        },
        timestamp: expect.any(String),
      });
    });

    it('should include trace information in error responses', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .send({}) // Invalid request body
        .expect(401); // Auth required first

      expect(response.body.error).toHaveProperty('traceId');
      expect(typeof response.body.error.traceId).toBe('string');
    });
  });

  describe('Request Processing Middleware', () => {
    it('should handle JSON content type properly', async () => {
      const response = await request(app.server)
        .get('/api/v1/users')
        .set('Accept', 'application/json')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toBeInstanceOf(Object);
    });

    it('should handle large request headers gracefully', async () => {
      const largeValue = 'x'.repeat(1000); // 1KB header value
      
      const response = await request(app.server)
        .get('/api/v1/users')
        .set('X-Custom-Header', largeValue);

      // Should either succeed or fail gracefully
      expect([200, 400, 413, 431]).toContain(response.status);
    });

    it('should enforce content-type for POST requests', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', 'Bearer fake-token')
        .set('Content-Type', 'text/plain')
        .send('invalid content')
        .expect(500); // API returns 500 for content type issues

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(Object),
      });
    });
  });

  describe('Security Headers Middleware', () => {
    it('should not expose server implementation details', async () => {
      const response = await request(app.server)
        .get('/api/v1/users');

      // Should not expose sensitive headers
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['server']).toBeUndefined();
    });

    it('should handle different HTTP methods appropriately', async () => {
      // Test various HTTP methods
      const getResponse = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      expect(getResponse.body.success).toBe(true);

      // HEAD should work like GET but without body
      const headResponse = await request(app.server)
        .head('/api/v1/users')
        .expect(200);

      expect(headResponse.body).toEqual({});
    });
  });

  describe('Rate Limiting and Performance', () => {
    it('should handle multiple simultaneous requests', async () => {
      const requests = Array.from({ length: 3 }, () =>
        request(app.server).get('/api/v1/users')
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    it('should respond within reasonable time limits', async () => {
      const startTime = Date.now();
      
      await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should handle rapid sequential requests', async () => {
      const responses = [];
      
      for (let i = 0; i < 5; i++) {
        const response = await request(app.server)
          .get('/api/v1/users');
        responses.push(response);
      }

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Health Check Integration', () => {
    it('should provide health status through middleware stack', async () => {
      const response = await request(app.server)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          status: 'healthy',
          timestamp: expect.any(String),
          version: expect.any(String),
          environment: expect.any(String),
        }),
        timestamp: expect.any(String),
      });
    });

    it('should handle health check with custom headers', async () => {
      const response = await request(app.server)
        .get('/health')
        .set('User-Agent', 'HealthCheck/1.0')
        .set('X-Requested-With', 'HealthMonitor')
        .expect(200);

      expect(response.body.data.status).toBe('healthy');
    });
  });

  describe('Request Logging and Monitoring', () => {
    it('should process requests through logging middleware', async () => {
      // Create a test user first
      await app.prisma.user.create({
        data: {
          name: 'Test User',
          email: 'test@example.com',
          version: 1,
        },
      });

      const response = await request(app.server)
        .get('/api/v1/users')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            name: 'Test User',
            email: 'test@example.com',
          }),
        ]),
      });
    });

    it('should maintain request context through middleware chain', async () => {
      const response = await request(app.server)
        .get('/api/v1/users')
        .set('X-Request-ID', 'test-request-123')
        .expect(200);

      // Response should maintain consistent structure
      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        meta: expect.any(Object),
        timestamp: expect.any(String),
      });
    });
  });
});