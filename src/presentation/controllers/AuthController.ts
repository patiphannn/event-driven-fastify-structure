import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { ValidationError } from '../../shared/errors';
import { CONFIG } from '../../shared/config';
import { trace } from '@opentelemetry/api';
import pino from 'pino';

const logger = pino({ name: 'AuthController' });

// Mock user database - in production this would be a real database
const mockUsers = [
  { id: '1', email: 'admin@example.com', name: 'Admin User', password: 'admin123' },
  { id: '2', email: 'user@example.com', name: 'Regular User', password: 'user123' },
  { id: '3', email: 'test@example.com', name: 'Test User', password: 'test123' },
];

interface LoginRequest {
  email: string;
  password: string;
}

export class AuthController {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    const tracer = trace.getTracer(CONFIG.SERVICE_NAME);
    const span = tracer.startSpan('AuthController.login');

    try {
      const { email, password } = request.body as LoginRequest;

      // Validation
      if (!email || !password) {
        span.setAttributes({
          'error.type': 'validation_error',
          'error.message': 'Email and password are required',
        });
        throw new ValidationError('Email and password are required');
      }

      span.setAttributes({
        'http.method': request.method,
        'http.url': request.url,
        'user.email': email,
      });

      // Find user in mock database
      const user = mockUsers.find(u => u.email === email && u.password === password);
      
      if (!user) {
        span.setAttributes({
          'error.type': 'authentication_error',
          'error.message': 'Invalid credentials',
        });
        logger.warn({ email }, 'Failed login attempt');
        return reply.status(401).send({
          error: 'Authentication Error',
          message: 'Invalid email or password',
        });
      }

      // Generate JWT token
      const payload = {
        id: user.id,
        email: user.email,
        name: user.name,
      };

      const token = jwt.sign(payload, this.jwtSecret, { 
        expiresIn: this.jwtExpiresIn,
        issuer: CONFIG.SERVICE_NAME,
        audience: `${CONFIG.SERVICE_NAME}-clients`,
      } as jwt.SignOptions);

      span.setAttributes({
        'user.id': user.id,
        'user.name': user.name,
        'auth.token_generated': true,
      });

      logger.info({ 
        userId: user.id, 
        email: user.email, 
        name: user.name 
      }, 'User logged in successfully');

      return reply.status(200).send({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        expiresIn: this.jwtExpiresIn,
      });

    } catch (error) {
      span.recordException(error as Error);
      span.setAttributes({
        'error.type': error instanceof ValidationError ? 'validation_error' : 'internal_error',
      });

      logger.error({ error }, 'Error during login');

      if (error instanceof ValidationError) {
        return reply.status(400).send({
          error: 'Validation Error',
          message: error.message,
        });
      }

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    } finally {
      span.end();
    }
  }

  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    const tracer = trace.getTracer(CONFIG.SERVICE_NAME);
    const span = tracer.startSpan('AuthController.getProfile');

    try {
      // User info is attached by auth middleware
      const user = (request as any).user;

      span.setAttributes({
        'http.method': request.method,
        'http.url': request.url,
        'user.id': user.id,
        'user.email': user.email,
      });

      logger.info({ userId: user.id }, 'Profile requested');

      return reply.status(200).send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });

    } catch (error) {
      span.recordException(error as Error);
      logger.error({ error }, 'Error getting profile');

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    } finally {
      span.end();
    }
  }
}
