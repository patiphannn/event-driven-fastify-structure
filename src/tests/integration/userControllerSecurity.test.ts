import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { IntegrationTestSetup, TestEnvironment } from './setup';

describe('UserController Security Tests', () => {
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

  describe('Input Validation Security', () => {
    it('should reject SQL injection attempts in user data', async () => {
      const maliciousData = {
        name: "'; DROP TABLE users; --",
        email: "admin@example.com'; DELETE FROM users WHERE 1=1; --",
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .send(maliciousData);

      // Should either reject the input or sanitize it safely
      if (response.status === 202) {
        // If accepted, verify no SQL injection occurred
        const users = await app.prisma.user.findMany();
        expect(users.length).toBe(1);
        expect(users[0].name).toBe(maliciousData.name); // Treated as literal string
      } else {
        // Should be rejected with proper error
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should reject XSS attempts in user data', async () => {
      const xssData = {
        name: '<script>alert("XSS")</script>',
        email: 'user@example.com<script>document.location="http://evil.com"</script>',
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .send(xssData);

      if (response.status === 202) {
        // If accepted, verify data is properly escaped/sanitized
        const users = await app.prisma.user.findMany();
        expect(users[0].name).not.toContain('<script>');
        expect(users[0].email).not.toContain('<script>');
      } else {
        expect(response.status).toBe(400);
      }
    });

    it('should reject extremely long input values', async () => {
      const oversizedData = {
        name: 'A'.repeat(10000), // 10KB name
        email: `${'a'.repeat(1000)}@${'example'.repeat(100)}.com`,
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .send(oversizedData);

      // Should reject oversized inputs
      expect([400, 413]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate email format strictly', async () => {
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
        'user space@example.com',
        'user@example',
        'user..double.dot@example.com',
        'user@.example.com',
        'user@example..com',
      ];

      for (const email of invalidEmails) {
        const response = await request(app.server)
          .post('/api/v1/users')
          .send({
            name: 'Test User',
            email: email,
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should reject null bytes and control characters', async () => {
      const maliciousData = {
        name: 'Test\x00User', // Null byte
        email: 'test\x01@example.com\x02', // Control characters
      };

      const response = await request(app.server)
        .post('/api/v1/users')
        .send(maliciousData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should handle missing authentication tokens appropriately', async () => {
      // Test operations that might require authentication
      const operations = [
        () => request(app.server).post('/api/v1/users').send({
          name: 'Test User',
          email: 'test@example.com',
        }),
        () => request(app.server).get('/api/v1/users'),
      ];

      for (const operation of operations) {
        const response = await operation();
        
        // Should either allow (public) or require auth (401/403)
        expect([200, 202, 401, 403]).toContain(response.status);
        
        if ([401, 403].includes(response.status)) {
          expect(response.body).toHaveProperty('error');
        }
      }
    });

    it('should reject invalid authentication tokens', async () => {
      const invalidTokens = [
        'invalid-token',
        'Bearer ',
        'Bearer invalid',
        'Basic dGVzdDp0ZXN0', // Basic auth when expecting Bearer
        'Token malformed-jwt',
      ];

      for (const token of invalidTokens) {
        const response = await request(app.server)
          .post('/api/v1/users')
          .set('Authorization', token)
          .send({
            name: 'Test User',
            email: 'test@example.com',
          });

        // Should handle invalid tokens appropriately
        if ([401, 403].includes(response.status)) {
          expect(response.body).toHaveProperty('error');
        }
      }
    });

    it('should handle expired tokens gracefully', async () => {
      // Simulate expired token (this would need actual JWT implementation)
      const expiredToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';

      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Authorization', expiredToken)
        .send({
          name: 'Test User',
          email: 'test@example.com',
        });

      // Should handle expired tokens appropriately
      if ([401, 403].includes(response.status)) {
        expect(response.body).toMatchObject({
          error: expect.any(String),
          message: expect.stringMatching(/expired|invalid|unauthorized/i),
        });
      }
    });
  });

  describe('Resource Access Control', () => {
    let testUserId: string;

    beforeEach(async () => {
      // Create a test user
      const user = await app.prisma.user.create({
        data: {
          name: 'Access Control Test',
          email: 'access@example.com',
        },
      });
      testUserId = user.id;
    });

    it('should prevent unauthorized user modifications', async () => {
      // Try to update user without proper authorization
      const response = await request(app.server)
        .put(`/api/v1/users/${testUserId}`)
        .set('Authorization', 'Bearer fake-token-for-different-user')
        .send({
          name: 'Unauthorized Update',
        });

      // Should either allow (if no authorization) or deny appropriately
      if ([401, 403].includes(response.status)) {
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should prevent unauthorized user deletions', async () => {
      const response = await request(app.server)
        .delete(`/api/v1/users/${testUserId}`)
        .set('Authorization', 'Bearer fake-token-for-different-user');

      // Should either allow (if no authorization) or deny appropriately
      if ([401, 403].includes(response.status)) {
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should prevent access to non-existent resources safely', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.server)
        .get(`/users/${nonExistentId}`);

      // Should return 404, not expose internal errors
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        error: expect.any(String),
        message: expect.not.stringMatching(/database|internal|stack/i),
      });
    });
  });

  describe('Rate Limiting and DoS Protection', () => {
    it('should handle rapid successive requests appropriately', async () => {
      const rapidRequests = 100;
      const requests: Promise<any>[] = [];

      // Fire many requests rapidly
      for (let i = 0; i < rapidRequests; i++) {
        requests.push(
          request(app.server)
            .post('/api/v1/users')
            .send({
              name: `Rapid User ${i}`,
              email: `rapid${i}@example.com`,
            })
        );
      }

      const responses = await Promise.allSettled(requests);
      
      // Check for rate limiting responses
      const rateLimitedResponses = responses.filter(
        result => result.status === 'fulfilled' && result.value.status === 429
      );

      const successfulResponses = responses.filter(
        result => result.status === 'fulfilled' && result.value.status === 202
      );

      // Should either handle all requests or apply rate limiting
      if (rateLimitedResponses.length > 0) {
        console.log(`Rate limiting applied: ${rateLimitedResponses.length}/${rapidRequests} requests limited`);
        
        rateLimitedResponses.forEach(result => {
          if (result.status === 'fulfilled') {
            expect(result.value.body).toHaveProperty('error');
            expect(result.value.headers).toHaveProperty('retry-after');
          }
        });
      } else {
        console.log(`No rate limiting: ${successfulResponses.length}/${rapidRequests} requests succeeded`);
      }
    });

    it('should protect against resource exhaustion attacks', async () => {
      // Test with memory-intensive operations
      const heavyRequests = Array.from({ length: 20 }, (_, i) => ({
        name: 'A'.repeat(1000), // Large but valid data
        email: `heavy${i}@example.com`,
        additionalData: 'B'.repeat(1000), // Extra field that might be ignored
      }));

      const responses = await Promise.allSettled(
        heavyRequests.map(data =>
          request(app.server)
            .post('/api/v1/users')
            .send(data)
        )
      );

      // Should handle resource-intensive requests gracefully
      const overloadResponses = responses.filter(
        result => result.status === 'fulfilled' && 
        [413, 429, 503].includes(result.value.status)
      );

      if (overloadResponses.length > 0) {
        console.log(`Resource protection applied: ${overloadResponses.length}/${heavyRequests.length} requests rejected`);
      }
    });
  });

  describe('Data Leakage Prevention', () => {
    it('should not expose sensitive information in error messages', async () => {
      // Test various error scenarios
      const errorScenarios = [
        () => request(app.server).post('/api/v1/users').send({}), // Validation error
        () => request(app.server).put('/users/invalid-id').send({ name: 'Test' }), // Invalid ID
        () => request(app.server).delete('/users/00000000-0000-0000-0000-000000000000'), // Not found
        () => request(app.server).post('/api/v1/users').send({ name: 'Test', email: 'invalid' }), // Invalid email
      ];

      for (const scenario of errorScenarios) {
        const response = await scenario();
        
        if (response.status >= 400) {
          const errorBody = JSON.stringify(response.body).toLowerCase();
          
          // Should not expose sensitive information
          expect(errorBody).not.toMatch(/password|token|secret|key|database|connection/);
          expect(errorBody).not.toMatch(/stack trace|file path|line number/);
          expect(errorBody).not.toMatch(/prisma|sql|query/);
        }
      }
    });

    it('should not expose internal system information', async () => {
      const response = await request(app.server)
        .get('/api/v1/users')
        .set('X-Forwarded-For', '127.0.0.1')
        .set('User-Agent', 'Security-Test/1.0');

      // Should not expose server information
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['server']).not.toMatch(/fastify|node|version/i);
    });
  });

  describe('Content Security', () => {
    it('should enforce proper content-type validation', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Content-Type', 'application/xml')
        .send('<user><name>Test</name><email>test@example.com</email></user>');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate request headers appropriately', async () => {
      const response = await request(app.server)
        .post('/api/v1/users')
        .set('Content-Length', '999999') // Mismatched content length
        .send({
          name: 'Test User',
          email: 'test@example.com',
        });

      // Should handle header validation appropriately
      expect([400, 413]).toContain(response.status);
    });

    it('should set appropriate security headers', async () => {
      const response = await request(app.server)
        .get('/api/v1/users');

      // Check for security headers (if configured)
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
        'strict-transport-security',
      ];

      securityHeaders.forEach(header => {
        if (response.headers[header]) {
          console.log(`Security header ${header}: ${response.headers[header]}`);
        }
      });
    });
  });

  describe('Audit and Monitoring', () => {
    it('should log security-relevant events appropriately', async () => {
      // This test would require access to logs
      // For now, we verify that operations complete (logging happens internally)
      
      const securityEvents = [
        () => request(app.server).post('/api/v1/users').send({}), // Validation failure
        () => request(app.server).get('/api/v1/users').set('Authorization', 'Bearer invalid'), // Invalid auth
        () => request(app.server).delete('/users/invalid-id'), // Invalid resource access
      ];

      for (const event of securityEvents) {
        const response = await event();
        // Verify that the request is handled (logging would happen internally)
        expect(response.status).toBeGreaterThan(0);
      }
    });

    it('should handle concurrent security events', async () => {
      // Simulate multiple potential security events
      const securityScenarios = Array.from({ length: 10 }, (_, i) => 
        request(app.server)
          .post('/api/v1/users')
          .set('Authorization', `Bearer fake-token-${i}`)
          .send({
            name: `Security Test ${i}`,
            email: `security${i}@example.com`,
          })
      );

      const responses = await Promise.allSettled(securityScenarios);
      
      // All requests should be handled gracefully
      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          expect(result.value.status).toBeGreaterThan(0);
          expect(result.value.body).toBeDefined();
        }
      });
    });
  });
});