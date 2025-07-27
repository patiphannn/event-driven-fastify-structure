import { createClient, RedisClientType } from 'redis';
import pino from 'pino';

export class RedisClient {
  private static instance: RedisClientType;
  private static logger = pino({ name: 'RedisClient' });

  static async getInstance(): Promise<RedisClientType> {
    if (!RedisClient.instance) {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      RedisClient.instance = createClient({
        url: redisUrl,
      });

      RedisClient.instance.on('error', (err) => {
        RedisClient.logger.error(err, 'Redis client error');
      });

      RedisClient.instance.on('connect', () => {
        RedisClient.logger.info('Redis client connected');
      });

      RedisClient.instance.on('disconnect', () => {
        RedisClient.logger.info('Redis client disconnected');
      });

      await RedisClient.instance.connect();
    }

    return RedisClient.instance;
  }

  static async disconnect(): Promise<void> {
    if (RedisClient.instance) {
      await RedisClient.instance.disconnect();
    }
  }

  static async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = await RedisClient.getInstance();
    if (ttlSeconds) {
      await client.setEx(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  }

  static async get(key: string): Promise<string | null> {
    const client = await RedisClient.getInstance();
    return await client.get(key);
  }

  static async del(key: string): Promise<void> {
    const client = await RedisClient.getInstance();
    await client.del(key);
  }
}
