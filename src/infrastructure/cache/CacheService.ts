import { RedisClientType } from 'redis';
import pino from 'pino';

const logger = pino({ name: 'CacheService' });

export class CacheService {
  private readonly DEFAULT_TTL = 300; // 5 minutes

  constructor(private readonly redisClient: RedisClientType) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redisClient.get(key);
      if (cached) {
        logger.debug({ key }, 'Cache hit');
        return JSON.parse(cached);
      }
      logger.debug({ key }, 'Cache miss');
      return null;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const ttl = ttlSeconds || this.DEFAULT_TTL;
      const serialized = JSON.stringify(value);
      await this.redisClient.setEx(key, ttl, serialized);
      logger.debug({ key, ttl }, 'Cache set');
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redisClient.del(key);
      logger.debug({ key }, 'Cache deleted');
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redisClient.keys(pattern);
      if (keys.length > 0) {
        await this.redisClient.del(keys);
        logger.debug({ pattern, count: keys.length }, 'Cache pattern deleted');
      }
    } catch (error) {
      logger.error({ error, pattern }, 'Cache pattern delete error');
    }
  }

  generateKey(prefix: string, ...parts: string[]): string {
    return `${prefix}:${parts.join(':')}`;
  }

  generateUserListKey(page: number, limit: number): string {
    return this.generateKey('users', 'list', `page:${page}`, `limit:${limit}`);
  }
}
