import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { IntegrationTestSetup, TestEnvironment } from './setup';

describe('UserController Performance Tests', () => {
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

  describe('Load Testing', () => {
    it('should handle concurrent user creation requests', async () => {
      const concurrentRequests = 20;
      const userPromises: Promise<any>[] = [];

      // Create multiple users concurrently
      for (let i = 0; i < concurrentRequests; i++) {
        const userPromise = request(app.server)
          .post('/api/v1/users')
          .send({
            name: `Load Test User ${i}`,
            email: `loadtest${i}@example.com`,
          });
        userPromises.push(userPromise);
      }

      const responses = await Promise.allSettled(userPromises);
      
      // Count successful responses
      const successfulResponses = responses.filter(
        result => result.status === 'fulfilled' && result.value.status === 202
      );

      // Should handle most requests successfully
      expect(successfulResponses.length).toBeGreaterThan(concurrentRequests * 0.8);

      // Verify users were created in database
      const users = await app.prisma.user.findMany();
      expect(users.length).toBe(successfulResponses.length);

      // Verify outbox events were created
      const events = await app.prisma.outboxEvent.findMany();
      expect(events.length).toBe(successfulResponses.length);
    });

    it('should handle concurrent read requests efficiently', async () => {
      // Create some test data
      const testUsers = Array.from({ length: 50 }, (_, i) => ({
        name: `Read Test User ${i}`,
        email: `readtest${i}@example.com`,
      }));
      await app.prisma.user.createMany({ data: testUsers });

      const concurrentReads = 50;
      const startTime = Date.now();

      // Perform concurrent read operations
      const readPromises = Array.from({ length: concurrentReads }, () =>
        request(app.server).get('/api/v1/users?limit=10')
      );

      const responses = await Promise.all(readPromises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data).toBeInstanceOf(Array);
      });

      // Should complete within reasonable time (adjust threshold as needed)
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 50 concurrent reads

      console.log(`Concurrent reads performance: ${concurrentReads} requests in ${totalTime}ms (${(totalTime / concurrentReads).toFixed(2)}ms avg)`);
    });

    it('should handle mixed CRUD operations concurrently', async () => {
      // Create initial users
      const initialUsers = await Promise.all(
        Array.from({ length: 10 }, async (_, i) => {
          const response = await request(app.server)
            .post('/api/v1/users')
            .send({
              name: `Mixed Test User ${i}`,
              email: `mixedtest${i}@example.com`,
            });
          return response.body.id;
        })
      );

      // Wait for initial creation to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const mixedOperations: Promise<any>[] = [];

      // Create operations
      for (let i = 10; i < 15; i++) {
        mixedOperations.push(
          request(app.server)
            .post('/api/v1/users')
            .send({
              name: `Mixed Create User ${i}`,
              email: `mixedcreate${i}@example.com`,
            })
        );
      }

      // Read operations
      for (let i = 0; i < 10; i++) {
        mixedOperations.push(
          request(app.server).get('/api/v1/users?limit=5')
        );
      }

      // Update operations
      for (let i = 0; i < 5; i++) {
        mixedOperations.push(
          request(app.server)
            .put(`/api/v1/users/${initialUsers[i]}`)
            .send({
              name: `Updated Mixed User ${i}`,
            })
        );
      }

      // Delete operations
      for (let i = 5; i < 8; i++) {
        mixedOperations.push(
          request(app.server).delete(`/api/v1/users/${initialUsers[i]}`)
        );
      }

      const startTime = Date.now();
      const results = await Promise.allSettled(mixedOperations);
      const endTime = Date.now();

      // Count successful operations by type
      const successfulResults = results.filter(
        result => result.status === 'fulfilled' && 
        [200, 202].includes(result.value.status)
      );

      expect(successfulResults.length).toBeGreaterThan(mixedOperations.length * 0.8);
      
      console.log(`Mixed operations performance: ${mixedOperations.length} operations in ${endTime - startTime}ms`);
    });
  });

  describe('Stress Testing', () => {
    it('should handle rapid successive operations on same resource', async () => {
      // Create a user
      const createResponse = await request(app.server)
        .post('/api/v1/users')
        .send({
          name: 'Stress Test User',
          email: 'stress@example.com',
        })
        .expect(202);

      const userId = createResponse.body.id;

      // Perform rapid updates
      const rapidUpdates = Array.from({ length: 10 }, (_, i) =>
        request(app.server)
          .put(`/api/v1/users/${userId}`)
          .send({
            name: `Rapid Update ${i}`,
          })
      );

      const updateResults = await Promise.allSettled(rapidUpdates);
      
      // Some updates should succeed (others may fail due to optimistic locking)
      const successfulUpdates = updateResults.filter(
        result => result.status === 'fulfilled' && result.value.status === 200
      );

      expect(successfulUpdates.length).toBeGreaterThan(0);

      // Verify final state
      const finalUser = await app.prisma.user.findUnique({
        where: { id: userId },
      });
      expect(finalUser).not.toBeNull();
      expect(finalUser?.name).toMatch(/^Rapid Update \d+$/);
    });

    it('should handle memory pressure with large datasets', async () => {
      // Create a large number of users
      const batchSize = 100;
      const totalUsers = 500;
      
      for (let batch = 0; batch < totalUsers / batchSize; batch++) {
        const batchUsers = Array.from({ length: batchSize }, (_, i) => ({
          name: `Batch ${batch} User ${i}`,
          email: `batch${batch}user${i}@example.com`,
        }));
        
        await app.prisma.user.createMany({ data: batchUsers });
      }

      // Test pagination performance with large dataset
      const startTime = Date.now();
      
      const paginationTests = await Promise.all([
        request(app.server).get('/api/v1/users?page=1&limit=50'),
        request(app.server).get('/api/v1/users?page=5&limit=50'),
        request(app.server).get('/api/v1/users?page=10&limit=50'),
      ]);

      const endTime = Date.now();

      // All pagination requests should succeed
      paginationTests.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.pagination.total).toBe(totalUsers);
      });

      // Should handle large dataset efficiently
      expect(endTime - startTime).toBeLessThan(2000); // 2 seconds

      console.log(`Large dataset pagination: ${totalUsers} total users, 3 pages in ${endTime - startTime}ms`);
    });
  });

  describe('Error Recovery Testing', () => {
    it('should recover gracefully from database timeout scenarios', async () => {
      // This test simulates database pressure by creating many concurrent operations
      const heavyOperations: Promise<any>[] = [];

      // Create operations that might cause database contention
      for (let i = 0; i < 50; i++) {
        heavyOperations.push(
          request(app.server)
            .post('/api/v1/users')
            .send({
              name: `Heavy Load User ${i}`,
              email: `heavyload${i}@example.com`,
            })
        );
      }

      const results = await Promise.allSettled(heavyOperations);
      
      // Some operations might fail due to timeouts, but should fail gracefully
      const successfulOps = results.filter(
        result => result.status === 'fulfilled' && result.value.status === 202
      );
      
      const failedOps = results.filter(
        result => result.status === 'fulfilled' && result.value.status >= 500
      );

      // Should have mostly successful operations
      expect(successfulOps.length).toBeGreaterThan(heavyOperations.length * 0.7);
      
      // Failed operations should return proper error responses
      failedOps.forEach(result => {
        if (result.status === 'fulfilled') {
          expect(result.value.body).toHaveProperty('error');
        }
      });
    });

    it('should handle resource exhaustion gracefully', async () => {
      // Test behavior when creating users with very long data
      const largeDataUsers = Array.from({ length: 10 }, (_, i) => ({
        name: 'A'.repeat(100), // Large but valid name
        email: `large${i}@${'example'.repeat(10)}.com`,
      }));

      const responses = await Promise.allSettled(
        largeDataUsers.map(userData =>
          request(app.server)
            .post('/api/v1/users')
            .send(userData)
        )
      );

      // Should handle large data gracefully (either accept or reject properly)
      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          expect([202, 400, 413]).toContain(result.value.status);
          if (result.value.status >= 400) {
            expect(result.value.body).toHaveProperty('error');
          }
        }
      });
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet response time SLAs for user operations', async () => {
      // Create test user
      const createStart = Date.now();
      const createResponse = await request(app.server)
        .post('/api/v1/users')
        .send({
          name: 'SLA Test User',
          email: 'sla@example.com',
        })
        .expect(202);
      const createTime = Date.now() - createStart;

      const userId = createResponse.body.id;

      // Test read operation
      const readStart = Date.now();
      await request(app.server)
        .get('/api/v1/users')
        .expect(200);
      const readTime = Date.now() - readStart;

      // Test update operation
      const updateStart = Date.now();
      await request(app.server)
        .put(`/api/v1/users/${userId}`)
        .send({ name: 'Updated SLA User' })
        .expect(200);
      const updateTime = Date.now() - updateStart;

      // Test delete operation
      const deleteStart = Date.now();
      await request(app.server)
        .delete(`/api/v1/users/${userId}`)
        .expect(200);
      const deleteTime = Date.now() - deleteStart;

      // SLA assertions (adjust thresholds based on requirements)
      expect(createTime).toBeLessThan(1000); // 1 second
      expect(readTime).toBeLessThan(500);    // 500ms
      expect(updateTime).toBeLessThan(1000); // 1 second
      expect(deleteTime).toBeLessThan(1000); // 1 second

      console.log('Performance metrics:');
      console.log(`  Create: ${createTime}ms`);
      console.log(`  Read:   ${readTime}ms`);
      console.log(`  Update: ${updateTime}ms`);
      console.log(`  Delete: ${deleteTime}ms`);
    });

    it('should scale linearly with dataset size for read operations', async () => {
      const testSizes = [10, 50, 100];
      const timings: { size: number; time: number }[] = [];

      for (const size of testSizes) {
        // Create test dataset
        await app.prisma.user.deleteMany({});
        const users = Array.from({ length: size }, (_, i) => ({
          name: `Scale Test User ${i}`,
          email: `scale${i}@example.com`,
        }));
        await app.prisma.user.createMany({ data: users });

        // Measure read performance
        const start = Date.now();
        await request(app.server)
          .get('/api/v1/users?limit=20')
          .expect(200);
        const time = Date.now() - start;

        timings.push({ size, time });
      }

      // Log performance scaling
      console.log('Read performance scaling:');
      timings.forEach(({ size, time }) => {
        console.log(`  ${size} users: ${time}ms`);
      });

      // Verify reasonable scaling (times shouldn't increase dramatically)
      const smallTime = timings[0].time;
      const largeTime = timings[timings.length - 1].time;
      const scalingFactor = largeTime / smallTime;

      // Should scale reasonably (less than 5x increase for 10x data)
      expect(scalingFactor).toBeLessThan(5);
    });
  });
});