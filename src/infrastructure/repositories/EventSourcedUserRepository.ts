import { UserRepository } from '../../domain/repositories/UserRepository';
import { User } from '../../domain/entities/User';
import { EventStore } from '../../domain/repositories/EventStore';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { DatabaseClient } from '../database/DatabaseClient';
import { Prisma } from '@prisma/client';
import pino from 'pino';

const logger = pino({ name: 'EventSourcedUserRepository' });

export class EventSourcedUserRepository implements UserRepository {
  private readonly prisma = DatabaseClient.getInstance();

  constructor(private readonly eventStore: EventStore) {}

  async save(user: User): Promise<User> {
    try {
      // Check if user already exists by email (for unique constraint)
      const existingUser = await this.findByEmail(user.email);
      if (existingUser && existingUser.id !== user.id) {
        throw new ConflictError(`User with email ${user.email} already exists`);
      }

      // Save domain events to event store
      const domainEvents = user.domainEvents;
      if (domainEvents.length > 0) {
        await this.eventStore.saveEvents(user.id, [...domainEvents], user.version - domainEvents.length);
        user.clearDomainEvents();
      }

      // Save/update snapshot in main table for queries
      await this.prisma.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.email,
          name: user.name,
          version: user.version,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          deletedAt: user.deletedAt,
          createdBy: user.createdBy ? user.createdBy as any : Prisma.DbNull,
          updatedBy: user.updatedBy ? user.updatedBy as any : Prisma.DbNull,
          deletedBy: user.deletedBy ? user.deletedBy as any : Prisma.DbNull,
        },
        update: {
          email: user.email,
          name: user.name,
          version: user.version,
          updatedAt: user.updatedAt,
          deletedAt: user.deletedAt,
          updatedBy: user.updatedBy ? user.updatedBy as any : Prisma.DbNull,
          deletedBy: user.deletedBy ? user.deletedBy as any : Prisma.DbNull,
        },
      });

      logger.info(
        { 
          userId: user.id, 
          email: user.email, 
          version: user.version,
          eventCount: domainEvents.length
        }, 
        'User saved with events'
      );

      return user;
    } catch (error: any) {
      logger.error({ error, userId: user.id }, 'Failed to save user');
      
      if (error instanceof ConflictError) {
        throw error;
      }
      
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw new ConflictError(`User with email ${user.email} already exists`);
      }
      
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      // Try to get from event store first (full event sourcing)
      const eventStream = await this.eventStore.getSnapshot(id);
      if (eventStream && eventStream.events.length > 0) {
        const user = User.replayEvents(User, eventStream.events);
        return user;
      }

      // Fallback to snapshot table
      const userRecord = await this.prisma.user.findUnique({
        where: {
          id,
          deletedAt: null,
        },
      });

      if (!userRecord) {
        return null;
      }

      return new User(
        userRecord.id,
        userRecord.email,
        userRecord.name,
        userRecord.createdAt,
        userRecord.updatedAt,
        userRecord.deletedAt,
        userRecord.createdBy as any,
        userRecord.updatedBy as any,
        userRecord.deletedBy as any
      );
    } catch (error) {
      logger.error({ error, userId: id }, 'Failed to find user by ID');
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    // For email lookups, we use the snapshot table for performance
    const userRecord = await this.prisma.user.findUnique({
      where: {
        email,
        deletedAt: null,
      },
    });

    if (!userRecord) {
      return null;
    }

    // Optionally reconstruct from events for full consistency
    return this.findById(userRecord.id);
  }

  async findMany(page: number, limit: number): Promise<{ users: User[]; total: number }> {
    const offset = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: offset,
        take: limit,
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    // For list queries, we can use snapshots for performance
    // But we could reconstruct from events if needed for full consistency
    const userEntities = users.map(
      (user: any) => new User(
        user.id, 
        user.email, 
        user.name, 
        user.createdAt, 
        user.updatedAt, 
        user.deletedAt,
        user.createdBy,
        user.updatedBy,
        user.deletedBy
      )
    );

    return { users: userEntities, total };
  }

  // Event sourcing specific methods
  async getUserHistory(id: string): Promise<any[]> {
    const events = await this.eventStore.getEvents(id);
    return events.map(event => ({
      eventType: event.eventType,
      eventData: event.eventData,
      occurredAt: event.occurredAt,
      version: event.eventVersion,
      metadata: event.metadata,
    }));
  }

  async getUserByVersion(id: string, version: number): Promise<User | null> {
    const events = await this.eventStore.getEvents(id);
    const eventsUpToVersion = events.filter(e => e.eventVersion <= version);
    
    if (eventsUpToVersion.length === 0) {
      return null;
    }

    return User.replayEvents(User, eventsUpToVersion);
  }
}
