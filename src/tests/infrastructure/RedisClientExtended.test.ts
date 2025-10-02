import { RedisClient } from '../../infrastructure/cache/RedisClient';
import { createClient, RedisClientType } from 'redis';

// Mock redis
jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  }),
}));

describe('RedisClient', () => {
  let mockRedisClient: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset singleton instance for clean tests
    (RedisClient as any).instance = null;

    // Setup mock return value
    mockRedisClient = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };
    
    (createClient as jest.Mock).mockReturnValue(mockRedisClient);
  });

  afterEach(async () => {
    // Clean up singleton instance
    (RedisClient as any).instance = null;
  });

  describe('getInstance', () => {
    it('should return singleton instance', async () => {
      const instance1 = await RedisClient.getInstance();
      const instance2 = await RedisClient.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should create only one Redis client instance', async () => {
      await RedisClient.getInstance();
      await RedisClient.getInstance();
      
      // createClient should be called only once due to singleton
      expect(createClient).toHaveBeenCalledTimes(1);
    });

    it('should initialize Redis client with URL configuration', async () => {
      await RedisClient.getInstance();
      
      expect(createClient).toHaveBeenCalledWith({
        url: expect.any(String),
      });
    });

    it('should use default Redis URL when REDIS_URL is not set', async () => {
      delete process.env.REDIS_URL;
      
      await RedisClient.getInstance();
      
      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379',
      });
    });

    it('should use environment REDIS_URL when set', async () => {
      process.env.REDIS_URL = 'redis://custom-host:6380';
      
      await RedisClient.getInstance();
      
      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://custom-host:6380',
      });
      
      // Clean up
      delete process.env.REDIS_URL;
    });

    it('should set up error event listener', async () => {
      await RedisClient.getInstance();
      
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should set up connect event listener', async () => {
      await RedisClient.getInstance();
      
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should set up disconnect event listener', async () => {
      await RedisClient.getInstance();
      
      expect(mockRedisClient.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should call connect on client', async () => {
      await RedisClient.getInstance();
      
      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle connection errors', async () => {
      const connectionError = new Error('Connection failed');
      mockRedisClient.connect.mockRejectedValue(connectionError);
      
      await expect(RedisClient.getInstance()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('should call disconnect on client when instance exists', async () => {
      // Create instance first
      await RedisClient.getInstance();
      
      await RedisClient.disconnect();
      
      expect(mockRedisClient.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should not throw error when no instance exists', async () => {
      // Ensure no instance exists
      (RedisClient as any).instance = null;
      
      await expect(RedisClient.disconnect()).resolves.not.toThrow();
    });

    it('should handle disconnection errors gracefully', async () => {
      // Create instance first
      await RedisClient.getInstance();
      
      const disconnectionError = new Error('Disconnection failed');
      mockRedisClient.disconnect.mockRejectedValue(disconnectionError);
      
      await expect(RedisClient.disconnect()).rejects.toThrow('Disconnection failed');
    });
  });

  describe('set operation', () => {
    beforeEach(async () => {
      await RedisClient.getInstance();
    });

    it('should call set without TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      
      await RedisClient.set('test-key', 'test-value');
      
      expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', 'test-value');
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });

    it('should call setEx with TTL', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');
      
      await RedisClient.set('test-key', 'test-value', 3600);
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith('test-key', 3600, 'test-value');
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should handle set errors', async () => {
      const setError = new Error('Set operation failed');
      mockRedisClient.set.mockRejectedValue(setError);
      
      await expect(RedisClient.set('test-key', 'test-value')).rejects.toThrow('Set operation failed');
    });

    it('should handle setEx errors', async () => {
      const setExError = new Error('SetEx operation failed');
      mockRedisClient.setEx.mockRejectedValue(setExError);
      
      await expect(RedisClient.set('test-key', 'test-value', 3600)).rejects.toThrow('SetEx operation failed');
    });
  });

  describe('get operation', () => {
    beforeEach(async () => {
      await RedisClient.getInstance();
    });

    it('should call get and return value', async () => {
      mockRedisClient.get.mockResolvedValue('test-value');
      
      const result = await RedisClient.get('test-key');
      
      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
      expect(result).toBe('test-value');
    });

    it('should return null when key does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await RedisClient.get('non-existent-key');
      
      expect(mockRedisClient.get).toHaveBeenCalledWith('non-existent-key');
      expect(result).toBeNull();
    });

    it('should handle get errors', async () => {
      const getError = new Error('Get operation failed');
      mockRedisClient.get.mockRejectedValue(getError);
      
      await expect(RedisClient.get('test-key')).rejects.toThrow('Get operation failed');
    });
  });

  describe('del operation', () => {
    beforeEach(async () => {
      await RedisClient.getInstance();
    });

    it('should call del', async () => {
      mockRedisClient.del.mockResolvedValue(1);
      
      await RedisClient.del('test-key');
      
      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle del errors', async () => {
      const delError = new Error('Del operation failed');
      mockRedisClient.del.mockRejectedValue(delError);
      
      await expect(RedisClient.del('test-key')).rejects.toThrow('Del operation failed');
    });
  });

  describe('static method integration', () => {
    it('should work with get, set, del in sequence', async () => {
      // Mock successful operations
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue('test-value');
      mockRedisClient.del.mockResolvedValue(1);
      
      // Perform operations
      await RedisClient.set('test-key', 'test-value');
      const value = await RedisClient.get('test-key');
      await RedisClient.del('test-key');
      
      expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', 'test-value');
      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
      expect(value).toBe('test-value');
    });

    it('should maintain singleton across static method calls', async () => {
      await RedisClient.set('key1', 'value1');
      await RedisClient.get('key2');
      await RedisClient.del('key3');
      
      // createClient should only be called once despite multiple operations
      expect(createClient).toHaveBeenCalledTimes(1);
    });
  });
});