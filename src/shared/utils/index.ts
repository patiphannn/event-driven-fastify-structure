import { trace, context } from '@opentelemetry/api';
import { TraceMetadata } from '../types';

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

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateName = (name: string): boolean => {
  return name.trim().length >= 2 && name.trim().length <= 100;
};
