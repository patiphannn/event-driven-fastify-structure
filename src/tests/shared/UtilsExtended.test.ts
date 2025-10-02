import { getTraceMetadata, validateEmail, validateName } from '../../shared/utils';

// Mock OpenTelemetry trace
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: jest.fn(),
  },
  context: {}
}));

import { trace } from '@opentelemetry/api';

describe('Shared Utils', () => {
  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      const validEmails = [
        'user@example.com',
        'test.user@domain.co.uk',
        'user+tag@example.org',
        'firstname.lastname@company.com',
        'user123@test-domain.com'
      ];

      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user..name@example.com',
        'user@.com',
        '',
        'user@domain',
        'user name@example.com'
      ];

      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      // These functions don't actually throw, they return false for invalid input
      expect(validateEmail(null as any)).toBe(false);
      expect(validateEmail(undefined as any)).toBe(false);
      expect(validateEmail(123 as any)).toBe(false);
    });
  });

  describe('validateName', () => {
    it('should validate correct name formats', () => {
      const validNames = [
        'John',
        'John Doe',
        'María García',
        'Jean-Pierre',
        "O'Connor",
        'Name With Multiple Words',
        'A'.repeat(100) // max length
      ];

      validNames.forEach(name => {
        expect(validateName(name)).toBe(true);
      });
    });

    it('should reject invalid name formats', () => {
      const invalidNames = [
        '',
        'A', // too short
        ' ', // whitespace only
        'A'.repeat(101), // too long
        '  A  ', // too short after trim
      ];

      invalidNames.forEach(name => {
        expect(validateName(name)).toBe(false);
      });
    });

    it('should accept names with numbers and special characters', () => {
      expect(validateName('John123')).toBe(true);
      expect(validateName("O'Connor")).toBe(true);
      expect(validateName('Jean-Pierre')).toBe(true);
    });

    it('should handle edge cases', () => {
      // These functions don't actually throw, they return false for invalid input
      expect(validateName(null as any)).toBe(false);
      expect(validateName(undefined as any)).toBe(false);
      expect(validateName(123 as any)).toBe(false);
    });

    it('should trim whitespace before validation', () => {
      expect(validateName('  John  ')).toBe(true);
      expect(validateName('  Valid Name  ')).toBe(true);
    });
  });

  describe('getTraceMetadata', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return undefined when no active span', () => {
      (trace.getActiveSpan as jest.Mock).mockReturnValue(null);
      
      const metadata = getTraceMetadata();
      
      expect(metadata).toBeUndefined();
    });

    it('should return trace metadata when active span exists', () => {
      const mockSpan = {
        spanContext: () => ({
          traceId: 'trace123',
          spanId: 'span456'
        })
      };
      (trace.getActiveSpan as jest.Mock).mockReturnValue(mockSpan);
      
      const metadata = getTraceMetadata();
      
      expect(metadata).toBeDefined();
      expect(metadata).toEqual({
        traceId: 'trace123',
        spanId: 'span456'
      });
    });

    it('should extract trace ID from span context', () => {
      const mockSpan = {
        spanContext: () => ({
          traceId: 'custom-trace-id',
          spanId: 'custom-span-id'
        })
      };
      (trace.getActiveSpan as jest.Mock).mockReturnValue(mockSpan);
      
      const metadata = getTraceMetadata();
      
      expect(metadata?.traceId).toBe('custom-trace-id');
    });

    it('should extract span ID from span context', () => {
      const mockSpan = {
        spanContext: () => ({
          traceId: 'trace-id',
          spanId: 'custom-span-id'
        })
      };
      (trace.getActiveSpan as jest.Mock).mockReturnValue(mockSpan);
      
      const metadata = getTraceMetadata();
      
      expect(metadata?.spanId).toBe('custom-span-id');
    });
  });
});