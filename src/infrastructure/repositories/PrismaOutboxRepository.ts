import { OutboxRepository } from '../../domain/repositories/OutboxRepository';
import { OutboxEvent } from '../../domain/entities/OutboxEvent';
import { DatabaseClient } from '../database/DatabaseClient';

export class PrismaOutboxRepository implements OutboxRepository {
  private readonly prisma = DatabaseClient.getInstance();

  async save(event: OutboxEvent): Promise<OutboxEvent> {
    const savedEvent = await this.prisma.outboxEvent.create({
      data: {
        id: event.id,
        eventType: event.eventType,
        eventData: event.eventData,
        metadata: event.metadata as any,
        processed: event.processed,
        processedAt: event.processedAt,
      },
    });

    return new OutboxEvent(
      savedEvent.id,
      savedEvent.eventType,
      savedEvent.eventData,
      savedEvent.metadata as any,
      savedEvent.processed,
      savedEvent.processedAt || undefined,
      savedEvent.createdAt
    );
  }

  async findUnprocessed(): Promise<OutboxEvent[]> {
    const events = await this.prisma.outboxEvent.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
    });

    return events.map(
      (event) =>
        new OutboxEvent(
          event.id,
          event.eventType,
          event.eventData,
          event.metadata as any,
          event.processed,
          event.processedAt || undefined,
          event.createdAt
        )
    );
  }

  async markAsProcessed(eventId: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });
  }
}
