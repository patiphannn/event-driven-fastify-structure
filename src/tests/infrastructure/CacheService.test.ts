import { CacheService } from '../../infrastructure/cache/CacheService';

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Redis client
    mockRedisClient = {
      get: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
      keys: jest.fn()
    };

    cacheService = new CacheService(mockRedisClient);
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      const key = 'test:key';
      const value = { data: 'test data' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(value));

      const result = await cacheService.get(key);

      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
      expect(result).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      const key = 'nonexistent:key';
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cacheService.get(key);

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      const key = 'error:key';
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await cacheService.get(key);

      expect(result).toBeNull();
    });

    it('should handle JSON parse errors', async () => {
      const key = 'invalid:json';
      mockRedisClient.get.mockResolvedValue('invalid json');

      const result = await cacheService.get(key);

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value in cache with custom TTL', async () => {
      const key = 'test:key';
      const value = { data: 'test data' };
      const ttl = 600;

      await cacheService.set(key, value, ttl);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        key,
        ttl,
        JSON.stringify(value)
      );
    });

    it('should set value with default TTL when no TTL provided', async () => {
      const key = 'test:key';
      const value = { data: 'test data' };

      await cacheService.set(key, value);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        key,
        300, // DEFAULT_TTL
        JSON.stringify(value)
      );
    });

    it('should handle Redis set errors gracefully', async () => {
      const key = 'error:key';
      const value = { data: 'test' };

      mockRedisClient.setEx.mockRejectedValue(new Error('Redis write failed'));

      await expect(cacheService.set(key, value)).resolves.not.toThrow();
    });
  });

  describe('del', () => {
    it('should delete key from cache', async () => {
      const key = 'test:key';

      await cacheService.del(key);

      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
    });

    it('should handle Redis delete errors gracefully', async () => {
      const key = 'error:key';
      mockRedisClient.del.mockRejectedValue(new Error('Redis delete failed'));

      await expect(cacheService.del(key)).resolves.not.toThrow();
    });
  });

  describe('delPattern', () => {
    it('should delete keys by pattern', async () => {
      const pattern = 'user:*';
      const keys = ['user:123', 'user:456'];
      
      mockRedisClient.keys.mockResolvedValue(keys);

      await cacheService.delPattern(pattern);

      expect(mockRedisClient.keys).toHaveBeenCalledWith(pattern);
      expect(mockRedisClient.del).toHaveBeenCalledWith(keys);
    });

    it('should handle empty key list gracefully', async () => {
      const pattern = 'nonexistent:*';
      mockRedisClient.keys.mockResolvedValue([]);

      await cacheService.delPattern(pattern);

      expect(mockRedisClient.keys).toHaveBeenCalledWith(pattern);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should handle pattern deletion errors gracefully', async () => {
      const pattern = 'error:*';
      mockRedisClient.keys.mockRejectedValue(new Error('Redis keys error'));

      await expect(cacheService.delPattern(pattern)).resolves.not.toThrow();
    });
  });

  describe('generateKey', () => {
    it('should generate key with prefix and parts', () => {
      const result = cacheService.generateKey('user', '123', 'profile');
      
      expect(result).toBe('user:123:profile');
    });

    it('should generate key with single part', () => {
      const result = cacheService.generateKey('session', 'abc123');
      
      expect(result).toBe('session:abc123');
    });

    it('should generate key with multiple parts', () => {
      const result = cacheService.generateKey('api', 'v1', 'users', 'list');
      
      expect(result).toBe('api:v1:users:list');
    });
  });

  describe('generateUserListKey', () => {
    it('should generate user list key with page and limit', () => {
      const result = cacheService.generateUserListKey(1, 10);
      
      expect(result).toBe('users:list:page:1:limit:10');
    });

    it('should generate user list key with different page and limit', () => {
      const result = cacheService.generateUserListKey(5, 25);
      
      expect(result).toBe('users:list:page:5:limit:25');
    });
  });
});