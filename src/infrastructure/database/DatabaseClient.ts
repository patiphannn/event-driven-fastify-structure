import { PrismaClient } from '@prisma/client';
import pino from 'pino';

export class DatabaseClient {
  private static instance: PrismaClient;
  private static logger = pino({ name: 'DatabaseClient' });

  static getInstance(): PrismaClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new PrismaClient({
        log: ['query', 'error', 'warn'],
      });
    }

    return DatabaseClient.instance;
  }

  static async disconnect(): Promise<void> {
    if (DatabaseClient.instance) {
      await DatabaseClient.instance.$disconnect();
    }
  }
}
