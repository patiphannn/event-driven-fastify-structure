import { trace, context } from '@opentelemetry/api';
import { TraceMetadata } from '../types';

/**
 * Utility Functions for the User Service
 * 
 * These are pure functions that can be used anywhere in the application.
 * They have no side effects and are easy to test.
 */

/**
 * Extract OpenTelemetry trace metadata from current context
 * 
 * For Junior Developers:
 * - Tracing helps track requests across services
 * - Each request gets a unique traceId
 * - spanId identifies specific operations within the trace
 * - This metadata is stored with events for debugging
 * 
 * @returns TraceMetadata if active span exists, undefined otherwise
 */
export const getTraceMetadata = (): TraceMetadata | undefined => {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) {
    return undefined;
  }

  const spanContext = activeSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
};

/**
 * Validate email format using regex
 * 
 * Business Rule: Emails must contain @ symbol and domain
 * 
 * @param email - Email string to validate
 * @returns true if valid format, false otherwise
 */
export const validateEmail = (email: string): boolean => {
  if (typeof email !== 'string' || !email) {
    return false;
  }
  
  // More strict email validation - requires TLD
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const trimmedEmail = email.trim();
  
  // Additional checks for edge cases
  if (trimmedEmail.includes('..') || trimmedEmail.includes(' ')) {
    return false;
  }
  
  return emailRegex.test(trimmedEmail);
};

/**
 * Validate user name length
 * 
 * Business Rule: Names must be 2-100 characters after trimming
 * 
 * @param name - Name string to validate
 * @returns true if valid length, false otherwise
 */
export const validateName = (name: string): boolean => {
  if (typeof name !== 'string' || !name) {
    return false;
  }
  
  const trimmedLength = name.trim().length;
  return trimmedLength >= 2 && trimmedLength <= 100;
};
