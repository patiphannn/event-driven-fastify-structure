import { PrismaClient } from '@prisma/client';
import pino from 'pino';

/**
 * Database Client Singleton
 * 
 * For Junior Developers - Singleton Pattern Explained:
 * 
 * What is Singleton?
 * - A design pattern that ensures only ONE instance of a class exists
 * - All parts of app share the same database connection
 * 
 * Why use Singleton for Database?
 * - Database connections are expensive to create
 * - We want to reuse the same connection pool
 * - Prevents "too many connections" errors
 * 
 * How it works:
 * 1. First call to getInstance() creates the connection
 * 2. Subsequent calls return the same connection
 * 3. Everyone in the app uses the same PrismaClient instance
 * 
 * Alternative Approach:
 * - Could use dependency injection container
 * - But Singleton is simpler for database connections
 */
export class DatabaseClient {
  // Static = belongs to class, not instance
  // This stores the single shared connection
  private static instance: PrismaClient;
  private static logger = pino({ name: 'DatabaseClient' });

  /**
   * Get the shared database connection
   * 
   * Lazy initialization: connection created only when first needed
   */
  static getInstance(): PrismaClient {
    if (!DatabaseClient.instance) {
      // Create connection with useful logging
      DatabaseClient.instance = new PrismaClient({
        log: ['query', 'error', 'warn'], // Shows SQL queries in development
      });
    }

    return DatabaseClient.instance;
  }

  /**
   * Gracefully close database connection
   * 
   * Important: Call this when shutting down app
   * Otherwise database might not release resources properly
   */
  static async disconnect(): Promise<void> {
    if (DatabaseClient.instance) {
      await DatabaseClient.instance.$disconnect();
    }
  }
}
