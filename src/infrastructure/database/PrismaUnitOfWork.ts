import { UnitOfWork } from '../../application/ports/UnitOfWork';
import { DatabaseClient } from './DatabaseClient';

export class PrismaUnitOfWork implements UnitOfWork {
  private readonly prisma = DatabaseClient.getInstance();

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async () => {
      return fn();
    });
  }
}
