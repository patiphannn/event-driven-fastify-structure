import 'dotenv/config';
import { initializeTracing, shutdownTracing } from './infrastructure/tracing/TracingSetup';

// Initialize tracing before importing other modules
initializeTracing();

import fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import pino from 'pino';
import { DatabaseClient } from './infrastructure/database/DatabaseClient';
import { RedisClient } from './infrastructure/cache/RedisClient';
import { PrismaUserRepository } from './infrastructure/repositories/PrismaUserRepository';
import { PrismaOutboxRepository } from './infrastructure/repositories/PrismaOutboxRepository';
import { PrismaUnitOfWork } from './infrastructure/database/PrismaUnitOfWork';
import { PrismaEventStore } from './infrastructure/repositories/PrismaEventStore';
import { EventSourcedUserRepository } from './infrastructure/repositories/EventSourcedUserRepository';
import { CreateUserUseCaseImpl } from './application/usecases/CreateUserUseCaseImpl';
import { UpdateUserUseCaseImpl } from './application/usecases/UpdateUserUseCaseImpl';
import { DeleteUserUseCaseImpl } from './application/usecases/DeleteUserUseCaseImpl';
import { ListUsersUseCaseImpl } from './application/usecases/ListUsersUseCaseImpl';
import { CacheService } from './infrastructure/cache/CacheService';
import { UserController } from './presentation/controllers/UserController';
import { EventHistoryController } from './presentation/controllers/EventHistoryController';
import { registerUserRoutes } from './presentation/routes/userRoutes';
import { registerEventHistoryRoutes } from './presentation/routes/eventHistoryRoutes';
import { swaggerOptions, swaggerUiOptions } from './infrastructure/swagger/SwaggerConfig';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

async function createApp() {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development' 
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
  });

  // Register Swagger
  await app.register(swagger, swaggerOptions);
  await app.register(swaggerUi, swaggerUiOptions);

  // Initialize Redis connection first
  const redisClient = await RedisClient.getInstance();
  logger.info('Redis client initialized');

  // Initialize dependencies
  const eventStore = new PrismaEventStore();
  const userRepository = new EventSourcedUserRepository(eventStore);
  const outboxRepository = new PrismaOutboxRepository();
  const unitOfWork = new PrismaUnitOfWork();
  const cacheService = new CacheService(redisClient);
  
  // Initialize use cases
  const createUserUseCase = new CreateUserUseCaseImpl(
    userRepository,
    outboxRepository,
    unitOfWork
  );
  
  const updateUserUseCase = new UpdateUserUseCaseImpl(
    userRepository,
    outboxRepository,
    unitOfWork
  );
  
  const deleteUserUseCase = new DeleteUserUseCaseImpl(
    userRepository,
    outboxRepository,
    unitOfWork
  );
  
  const listUsersUseCase = new ListUsersUseCaseImpl(
    userRepository,
    cacheService
  );

  // Initialize controllers
  const userController = new UserController(createUserUseCase, updateUserUseCase, deleteUserUseCase, listUsersUseCase);
  const eventHistoryController = new EventHistoryController(eventStore, userRepository);

  // Register routes
  registerUserRoutes(app, userController);
  registerEventHistoryRoutes(app, eventHistoryController);

  return app;
}

async function start() {
  try {
    const app = await createApp();
    const port = Number(process.env.PORT) || 3000;
    const host = '0.0.0.0';

    await app.listen({ port, host });
    logger.info(`Server listening on http://${host}:${port}`);
  } catch (error) {
    logger.error(error, 'Error starting server');
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('Shutting down server...');
  try {
    await DatabaseClient.disconnect();
    await RedisClient.disconnect();
    await shutdownTracing();
    logger.info('Server shut down successfully');
  } catch (error) {
    logger.error(error, 'Error during shutdown');
  }
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  start();
}
