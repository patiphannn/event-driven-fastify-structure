import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { UserInfo } from '../../shared/types/UserInfo';
import { CONFIG } from '../../shared/config';
import { trace } from '@opentelemetry/api';
import pino from 'pino';

const logger = pino({ name: 'AuthMiddleware' });

// Extend FastifyRequest interface to include user property
declare module 'fastify' {
  interface FastifyRequest {
    user?: UserInfo;
  }
}

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export class AuthMiddleware {
  private readonly jwtSecret: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  }

  async authenticate(request: FastifyRequest, reply: FastifyReply) {
    const tracer = trace.getTracer(CONFIG.SERVICE_NAME);
    const span = tracer.startSpan('AuthMiddleware.authenticate');

    try {
      // Extract token from Authorization header
      const authHeader = request.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        span.setAttributes({
          'error.type': 'missing_token',
          'error.message': 'No authorization token provided',
        });
        logger.warn({ url: request.url }, 'Authentication failed: No token provided');
        return reply.status(401).send({
          error: 'Authentication Error',
          message: 'Authorization token is required',
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify JWT token
      let payload: JwtPayload;
      try {
        payload = jwt.verify(token, this.jwtSecret) as JwtPayload;
      } catch (jwtError) {
        span.setAttributes({
          'error.type': 'invalid_token',
          'error.message': 'Token verification failed',
        });
        logger.warn({ 
          url: request.url, 
          error: jwtError instanceof Error ? jwtError.message : 'Unknown JWT error' 
        }, 'Authentication failed: Invalid token');
        return reply.status(401).send({
          error: 'Authentication Error',
          message: 'Invalid or expired token',
        });
      }

      // Validate payload structure
      if (!payload.id || !payload.email || !payload.name) {
        span.setAttributes({
          'error.type': 'invalid_payload',
          'error.message': 'Token payload is incomplete',
        });
        logger.warn({ url: request.url, payload }, 'Authentication failed: Invalid token payload');
        return reply.status(401).send({
          error: 'Authentication Error',
          message: 'Invalid token payload',
        });
      }

      // Attach user info to request
      request.user = {
        id: payload.id,
        email: payload.email,
        name: payload.name,
      };

      span.setAttributes({
        'user.id': payload.id,
        'user.email': payload.email,
        'user.name': payload.name,
        'auth.success': true,
      });

      logger.debug({ 
        userId: payload.id, 
        email: payload.email,
        url: request.url 
      }, 'User authenticated successfully');

    } catch (error) {
      span.recordException(error as Error);
      span.setAttributes({
        'error.type': 'middleware_error',
      });
      
      logger.error({ error, url: request.url }, 'Error in authentication middleware');
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Authentication service error',
      });
    } finally {
      span.end();
    }
  }

  // Optional middleware that allows requests to pass through even without authentication
  // but adds user info if token is present
  async optionalAuth(request: FastifyRequest, reply: FastifyReply) {
    const tracer = trace.getTracer(CONFIG.SERVICE_NAME);
    const span = tracer.startSpan('AuthMiddleware.optionalAuth');

    try {
      const authHeader = request.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No token provided, continue without user info
        span.setAttributes({
          'auth.optional': true,
          'auth.token_present': false,
        });
        return;
      }

      const token = authHeader.substring(7);

      try {
        const payload = jwt.verify(token, this.jwtSecret) as JwtPayload;
        
        if (payload.id && payload.email && payload.name) {
          request.user = {
            id: payload.id,
            email: payload.email,
            name: payload.name,
          };
          
          span.setAttributes({
            'auth.optional': true,
            'auth.token_present': true,
            'user.id': payload.id,
          });
        }
      } catch (jwtError) {
        // Invalid token, but since this is optional auth, just continue without user info
        logger.debug({ error: jwtError }, 'Optional auth: Invalid token provided');
        span.setAttributes({
          'auth.optional': true,
          'auth.token_present': true,
          'auth.token_valid': false,
        });
      }

    } catch (error) {
      span.recordException(error as Error);
      logger.error({ error }, 'Error in optional authentication middleware');
      // Don't fail the request for optional auth errors
    } finally {
      span.end();
    }
  }
}
