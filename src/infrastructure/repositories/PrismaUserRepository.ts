import { UserRepository } from '../../domain/repositories/UserRepository';
import { User } from '../../domain/entities/User';
import { DatabaseClient } from '../database/DatabaseClient';
import { ConflictError, NotFoundError } from '../../shared/errors';

export class PrismaUserRepository implements UserRepository {
  private readonly prisma = DatabaseClient.getInstance();

  async save(user: User): Promise<User> {
    try {
      // Check if user already exists (for updates)
      const existingUser = await this.prisma.user.findUnique({
        where: { id: user.id },
      });

      let savedUser;
      if (existingUser) {
        // Update existing user
        savedUser = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            email: user.email,
            name: user.name,
            version: { increment: 1 },
            deletedAt: user.deletedAt,
          },
        });
      } else {
        // Create new user
        savedUser = await this.prisma.user.create({
          data: {
            id: user.id,
            email: user.email,
            name: user.name,
            deletedAt: user.deletedAt,
          },
        });
      }

      return new User(
        savedUser.id,
        savedUser.email,
        savedUser.name,
        savedUser.createdAt,
        savedUser.updatedAt,
        savedUser.deletedAt
      );
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw new ConflictError(`User with email ${user.email} already exists`);
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    return new User(user.id, user.email, user.name, user.createdAt, user.updatedAt, user.deletedAt);
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return null;
    }

    return new User(user.id, user.email, user.name, user.createdAt, user.updatedAt, user.deletedAt);
  }

  async findMany(page: number, limit: number): Promise<{ users: User[]; total: number }> {
    const offset = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    const userEntities = users.map(
      (user) => new User(user.id, user.email, user.name, user.createdAt, user.updatedAt, user.deletedAt)
    );

    return { users: userEntities, total };
  }
}
