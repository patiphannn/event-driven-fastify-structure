import { EventStore, EventStream } from '../../domain/repositories/EventStore';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { DatabaseClient } from '../database/DatabaseClient';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const logger = pino({ name: 'PrismaEventStore' });

export class PrismaEventStore implements EventStore {
  private readonly prisma: PrismaClient;

  constructor() {
    this.prisma = DatabaseClient.getInstance();
  }

  private extractUpdatedBy(event_data: any): any {
    if (event_data.updatedBy) {
      return event_data.updatedBy;
    }
    if (event_data.deletedBy) {
      return event_data.deletedBy;
    }
    return null;
  }

  async saveEvents(aggregateId: string, events: DomainEvent[], expectedVersion: number): Promise<void> {
    if (events.length === 0) {
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Check current version for optimistic concurrency control
        const lastEvent = await tx.eventLog.findFirst({
          where: { aggregateId },
          orderBy: { eventVersion: 'desc' },
        });

        const currentVersion = lastEvent?.eventVersion || 0;
        if (currentVersion !== expectedVersion) {
          throw new Error(
            `Concurrency conflict. Expected version ${expectedVersion}, but current version is ${currentVersion}`
          );
        }

        // Save all events
        const eventRecords = events.map((event, index) => ({
          id: event.id,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          eventVersion: expectedVersion + index + 1,
          eventData: event.eventData,
          metadata: event.metadata || {},
          occurredAt: event.occurredAt,
          updatedBy: this.extractUpdatedBy(event.eventData),
        }));

        await tx.eventLog.createMany({
          data: eventRecords,
        });

        logger.info(
          {
            aggregateId,
            eventCount: events.length,
            newVersion: expectedVersion + events.length,
          },
          'Events saved to event store'
        );
      });
    } catch (error) {
      logger.error({ error, aggregateId, expectedVersion }, 'Failed to save events');
      throw error;
    }
  }

  async getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]> {
    const where: any = { aggregateId };
    if (fromVersion !== undefined) {
      where.eventVersion = { gt: fromVersion };
    }

    const eventRecords = await this.prisma.eventLog.findMany({
      where,
      orderBy: { eventVersion: 'asc' },
    });

    return eventRecords.map((record: any) => ({
      id: record.id,
      aggregateId: record.aggregateId,
      eventType: record.eventType,
      eventVersion: record.eventVersion,
      eventData: record.eventData,
      metadata: record.metadata as any,
      occurredAt: record.occurredAt,
    }));
  }

  async getAllEvents(fromPosition?: number, maxCount?: number): Promise<DomainEvent[]> {
    const where: any = {};
    if (fromPosition !== undefined) {
      where.position = { gt: fromPosition };
    }

    const eventRecords = await this.prisma.eventLog.findMany({
      where,
      orderBy: { position: 'asc' },
      take: maxCount,
      select: {
        id: true,
        aggregateId: true,
        eventType: true,
        eventVersion: true,
        eventData: true,
        metadata: true,
        occurredAt: true,
      },
    });

    return eventRecords.map((record: any) => ({
      id: record.id,
      aggregateId: record.aggregateId,
      eventType: record.eventType,
      eventVersion: record.eventVersion,
      eventData: record.eventData,
      metadata: record.metadata as any,
      occurredAt: record.occurredAt,
    }));
  }

  async getEventsByType(eventType: string, fromPosition?: number, maxCount?: number): Promise<DomainEvent[]> {
    const where: any = { eventType };
    if (fromPosition !== undefined) {
      where.position = { gt: fromPosition };
    }

    const eventRecords = await this.prisma.eventLog.findMany({
      where,
      orderBy: { position: 'asc' },
      take: maxCount,
      select: {
        id: true,
        aggregateId: true,
        eventType: true,
        eventVersion: true,
        eventData: true,
        metadata: true,
        occurredAt: true,
        // Explicitly exclude position to avoid BigInt serialization issues
      },
    });

    return eventRecords.map((record: any) => ({
      id: record.id,
      aggregateId: record.aggregateId,
      eventType: record.eventType,
      eventVersion: record.eventVersion,
      eventData: record.eventData,
      metadata: record.metadata as any,
      occurredAt: record.occurredAt,
    }));
  }

  async getSnapshot(aggregateId: string): Promise<EventStream | null> {
    const events = await this.getEvents(aggregateId);
    if (events.length === 0) {
      return null;
    }

    const lastEvent = events[events.length - 1];
    return {
      aggregateId,
      events,
      version: lastEvent.eventVersion,
    };
  }
}
