import { FastifyInstance } from 'fastify';
import { EventHistoryController } from '../controllers/EventHistoryController';

const getUserHistorySchema = {
  summary: 'Get user event history',
  description: 'Retrieve all events for a specific user',
  tags: ['Event History'],
  params: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID' }
    },
    required: ['userId']
  },
  response: {
    200: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              eventType: { type: 'string' },
              eventData: { type: 'object' },
              occurredAt: { type: 'string', format: 'date-time' },
              version: { type: 'number' },
              metadata: { type: 'object' }
            }
          }
        },
        totalEvents: { type: 'number' }
      }
    },
    404: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        message: { type: 'string' }
      }
    }
  }
};

const getUserAtVersionSchema = {
  summary: 'Get user state at specific version',
  description: 'Retrieve user state as it was at a specific event version',
  tags: ['Event History'],
  params: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID' },
      version: { type: 'number', description: 'Event version number' }
    },
    required: ['userId', 'version']
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        name: { type: 'string' },
        version: { type: 'number' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        isDeleted: { type: 'boolean' }
      }
    },
    404: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        message: { type: 'string' }
      }
    }
  }
};

const getAllEventsSchema = {
  summary: 'Get all events',
  description: 'Retrieve all events from the event store',
  tags: ['Event History'],
  querystring: {
    type: 'object',
    properties: {
      fromPosition: { type: 'number', description: 'Start from this position' },
      maxCount: { type: 'number', default: 100, description: 'Maximum number of events to return' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              aggregateId: { type: 'string' },
              eventType: { type: 'string' },
              eventVersion: { type: 'number' },
              eventData: { type: 'object' },
              metadata: { type: 'object' },
              occurredAt: { type: 'string', format: 'date-time' }
            }
          }
        },
        count: { type: 'number' }
      }
    }
  }
};

const getEventsByTypeSchema = {
  summary: 'Get events by type',
  description: 'Retrieve events of a specific type from the event store',
  tags: ['Event History'],
  params: {
    type: 'object',
    properties: {
      eventType: { type: 'string', description: 'Event type to filter by' }
    },
    required: ['eventType']
  },
  querystring: {
    type: 'object',
    properties: {
      fromPosition: { type: 'number', description: 'Start from this position' },
      maxCount: { type: 'number', default: 100, description: 'Maximum number of events to return' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        eventType: { type: 'string' },
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              aggregateId: { type: 'string' },
              eventVersion: { type: 'number' },
              eventData: { type: 'object' },
              metadata: { type: 'object' },
              occurredAt: { type: 'string', format: 'date-time' }
            }
          }
        },
        count: { type: 'number' }
      }
    }
  }
};

export function registerEventHistoryRoutes(app: FastifyInstance, controller: EventHistoryController) {
  // Get user event history
  app.get('/users/:userId/history', { schema: getUserHistorySchema }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    
    try {
      const history = await controller.getUserHistory(userId);
      return reply.code(200).send(history);
    } catch (error: any) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  // Get user state at specific version
  app.get('/users/:userId/versions/:version', { schema: getUserAtVersionSchema }, async (request, reply) => {
    const { userId, version } = request.params as { userId: string; version: string };
    
    try {
      const user = await controller.getUserAtVersion(userId, parseInt(version));
      
      if (!user) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `User ${userId} not found at version ${version}`
        });
      }
      
      return reply.code(200).send(user);
    } catch (error: any) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  // Get all events
  app.get('/events', { schema: getAllEventsSchema }, async (request, reply) => {
    const { fromPosition, maxCount = 100 } = request.query as { fromPosition?: number; maxCount?: number };
    
    try {
      const events = await controller.getAllEvents(fromPosition, maxCount);
      return reply.code(200).send(events);
    } catch (error: any) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  // Get events by type
  app.get('/events/type/:eventType', { schema: getEventsByTypeSchema }, async (request, reply) => {
    const { eventType } = request.params as { eventType: string };
    const { fromPosition, maxCount = 100 } = request.query as { fromPosition?: number; maxCount?: number };
    
    try {
      const events = await controller.getEventsByType(eventType, fromPosition, maxCount);
      return reply.code(200).send(events);
    } catch (error: any) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
}
