import { FastifyInstance } from 'fastify';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

export interface TestEnvironment {
  app: FastifyInstance;
  database: StartedTestContainer;
  cleanup: () => Promise<void>;
}

export class IntegrationTestSetup {
  private static database: StartedTestContainer;
  private static app: FastifyInstance;

  static async setup(): Promise<TestEnvironment> {
    // Start test database container
    this.database = await new GenericContainer('postgres:15-alpine')
      .withEnvironment({
        POSTGRES_DB: 'test_db',
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_password',
      })
      .withExposedPorts(5432)
      .withReuse()
      .start();

    const port = this.database.getMappedPort(5432);
    const host = this.database.getHost();

    // Override environment variables for testing
    process.env.DATABASE_URL = `postgresql://test_user:test_password@${host}:${port}/test_db`;
    process.env.REDIS_URL = 'redis://localhost:6379'; // Mock Redis or use fake implementation
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.PORT = '0'; // Let the system assign a random port

    // Import and create app after setting environment variables
    const { createApp } = await import('../../server');
    this.app = await createApp();

    // Run database migrations
    await this.runMigrations();

    return {
      app: this.app,
      database: this.database,
      cleanup: this.cleanup.bind(this),
    };
  }

  private static async runMigrations(): Promise<void> {
    const { execSync } = require('child_process');
    
    try {
      // Run Prisma migrations
      execSync('npx prisma migrate deploy', {
        env: { ...process.env },
        stdio: 'pipe',
      });
    } catch (error) {
      console.error('Failed to run migrations:', error);
      throw error;
    }
  }

  private static async cleanup(): Promise<void> {
    try {
      if (this.app) {
        // Close the Fastify app first
        await this.app.close();
      }

      // Shutdown OpenTelemetry tracing
      const { shutdownTracing } = await import('../../infrastructure/tracing/TracingSetup');
      await shutdownTracing();

      // Disconnect database client
      const { DatabaseClient } = await import('../../infrastructure/database/DatabaseClient');
      await DatabaseClient.disconnect();

      // Disconnect Redis client
      const { RedisClient } = await import('../../infrastructure/cache/RedisClient');
      await RedisClient.disconnect();

      if (this.database) {
        await this.database.stop();
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  static async teardown(): Promise<void> {
    await this.cleanup();
  }
}
