/**
 * Application configuration constants
 */
export const CONFIG = {
  /**
   * Service name used for tracing and logging
   */
  SERVICE_NAME: 'user-service',
  
  /**
   * Service version
   */
  SERVICE_VERSION: '1.0.0',
  
  /**
   * Default pagination limits
   */
  PAGINATION: {
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },
  
  /**
   * Cache TTL in seconds
   */
  CACHE_TTL: 300, // 5 minutes
} as const;
