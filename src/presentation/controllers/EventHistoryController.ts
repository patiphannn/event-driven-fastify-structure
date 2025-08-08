import { EventStore } from '../../domain/repositories/EventStore';
import { EventSourcedUserRepository } from '../../infrastructure/repositories/EventSourcedUserRepository';
import pino from 'pino';

const logger = pino({ name: 'EventHistoryController' });

export class EventHistoryController {
  constructor(
    private readonly eventStore: EventStore,
    private readonly userRepository: EventSourcedUserRepository
  ) {}

  async getUserHistory(userId: string) {
    try {
      const history = await this.userRepository.getUserHistory(userId);
      
      logger.info({ userId, eventCount: history.length }, 'User history retrieved');
      
      return {
        userId,
        events: history,
        totalEvents: history.length,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user history');
      throw error;
    }
  }

  async getUserAtVersion(userId: string, version: number) {
    try {
      const user = await this.userRepository.getUserByVersion(userId, version);
      
      if (!user) {
        return null;
      }

      logger.info({ userId, version }, 'User state at version retrieved');
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        version: user.version,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isDeleted: user.isDeleted,
      };
    } catch (error) {
      logger.error({ error, userId, version }, 'Failed to get user at version');
      throw error;
    }
  }

  async getAllEvents(fromPosition?: number, maxCount: number = 100) {
    try {
      const events = await this.eventStore.getAllEvents(fromPosition, maxCount);
      
      console.log('Controller - Raw events received:', JSON.stringify(events, null, 2));
      
      const mappedEvents = events.map(event => {
        console.log('Mapping event:', {
          eventType: event.eventType,
          eventData: event.eventData,
          eventDataType: typeof event.eventData,
          eventDataStringified: JSON.stringify(event.eventData)
        });
        
        return {
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          eventVersion: event.eventVersion,
          eventData: event.eventData,
          metadata: event.metadata,
          occurredAt: event.occurredAt,
        };
      });
      
      console.log('Controller - Final mapped events:', JSON.stringify(mappedEvents, null, 2));
      
      logger.info({ eventCount: events.length, fromPosition, maxCount }, 'All events retrieved');
      
      const result = {
        events: mappedEvents,
        count: events.length,
      };
      
      console.log('Controller - Final result:', JSON.stringify(result, null, 2));
      
      return result;
    } catch (error) {
      logger.error({ error, fromPosition, maxCount }, 'Failed to get all events');
      throw error;
    }
  }

  async getEventsByType(eventType: string, fromPosition?: number, maxCount: number = 100) {
    try {
      const events = await this.eventStore.getEventsByType(eventType, fromPosition, maxCount);
      
      logger.info({ eventType, eventCount: events.length, fromPosition, maxCount }, 'Events by type retrieved');
      
      return {
        eventType,
        events: events.map(event => ({
          aggregateId: event.aggregateId,
          eventVersion: event.eventVersion,
          eventData: event.eventData,
          metadata: event.metadata,
          occurredAt: event.occurredAt,
        })),
        count: events.length,
      };
    } catch (error) {
      logger.error({ error, eventType, fromPosition, maxCount }, 'Failed to get events by type');
      throw error;
    }
  }
}
