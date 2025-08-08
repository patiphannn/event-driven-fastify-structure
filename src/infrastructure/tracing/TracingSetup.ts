import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { CONFIG } from '../../shared/config';
import pino from 'pino';

const logger = pino({ name: 'TracingSetup' });

let sdk: NodeSDK | null = null;

export const initializeTracing = () => {
  // Skip tracing initialization in test environment to avoid cleanup issues
  if (process.env.NODE_ENV === 'test') {
    logger.info('Skipping OpenTelemetry tracing initialization in test environment');
    return;
  }
  
  try {
    const serviceName = process.env.OTEL_SERVICE_NAME || CONFIG.SERVICE_NAME;
    const serviceVersion = process.env.OTEL_SERVICE_VERSION || CONFIG.SERVICE_VERSION;
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

    // Set environment variables for OpenTelemetry
    process.env.OTEL_SERVICE_NAME = serviceName;
    process.env.OTEL_SERVICE_VERSION = serviceVersion;

    const traceExporter = new OTLPTraceExporter({
      url: otlpEndpoint,
    });

    sdk = new NodeSDK({
      traceExporter,
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (req) => {
            // Ignore health check and metrics endpoints
            return req.url?.includes('/health') || req.url?.includes('/metrics') || false;
          },
        }),
        new FastifyInstrumentation(),
      ],
    });

    sdk.start();
    logger.info({ serviceName, serviceVersion, otlpEndpoint }, 'OpenTelemetry tracing initialized');
  } catch (error) {
    logger.error(error, 'Failed to initialize OpenTelemetry tracing');
  }
};

export const shutdownTracing = async () => {
  if (sdk) {
    try {
      await sdk.shutdown();
      sdk = null; // Reset the SDK reference
      logger.info('OpenTelemetry tracing shut down successfully');
    } catch (error) {
      logger.error(error, 'Error shutting down OpenTelemetry tracing');
    }
  } else if (process.env.NODE_ENV === 'test') {
    // In test environment, tracing might not be initialized
    logger.info('OpenTelemetry tracing was not initialized (test environment)');
  }
};
