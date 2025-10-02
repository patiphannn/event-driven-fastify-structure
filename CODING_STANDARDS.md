# Coding Standards and Best Practices

## Overview
This document establishes coding standards for our Node.js microservice following Clean Architecture principles. These standards ensure code consistency, maintainability, and quality across the team.

## Table of Contents
1. [Architecture Principles](#architecture-principles)
2. [Project Structure](#project-structure)
3. [TypeScript Standards](#typescript-standards)
4. [Error Handling](#error-handling)
5. [API Design](#api-design)
6. [Logging and Tracing](#logging-and-tracing)
7. [Testing Standards](#testing-standards)
8. [Code Quality](#code-quality)

## Architecture Principles

### Clean Architecture Layers
```
┌─────────────────────────────────────────┐
│           Presentation Layer            │
│  Controllers, Routes, Middleware        │
├─────────────────────────────────────────┤
│           Application Layer             │
│     Use Cases, Business Logic          │
├─────────────────────────────────────────┤
│            Domain Layer                 │
│   Entities, Events, Repositories       │
├─────────────────────────────────────────┤
│          Infrastructure Layer           │
│  Database, Cache, External Services     │
└─────────────────────────────────────────┘
```

### Dependency Rule
- **MUST**: Dependencies point inward toward the domain layer
- **MUST**: Domain layer has no external dependencies
- **MUST**: Use dependency injection for external dependencies
- **MUST**: Implement interfaces in the domain layer

## Project Structure

### Required Directory Structure
```
src/
├── domain/               # Business entities and rules
│   ├── entities/        # Domain entities
│   ├── events/          # Domain events
│   └── repositories/    # Repository interfaces
├── application/         # Use cases and application logic
│   ├── ports/          # Interface definitions
│   └── usecases/       # Use case implementations
├── infrastructure/      # External concerns
│   ├── database/       # Database implementations
│   ├── cache/          # Cache implementations
│   ├── repositories/   # Repository implementations
│   ├── tracing/        # OpenTelemetry setup
│   └── swagger/        # API documentation
├── presentation/        # HTTP interface
│   ├── controllers/    # HTTP controllers
│   ├── routes/         # Route definitions
│   └── middleware/     # HTTP middleware
├── shared/             # Common utilities
│   ├── config/         # Configuration
│   ├── errors/         # Error definitions
│   ├── types/          # Type definitions
│   └── utils/          # Utility functions
└── tests/              # Test files
    ├── unit/           # Unit tests
    ├── integration/    # Integration tests
    └── e2e/            # End-to-end tests
```

## TypeScript Standards

### General Rules
- **MUST**: Use TypeScript for all new code
- **MUST**: Enable strict mode in tsconfig.json
- **MUST**: Use explicit return types for public methods
- **MUST**: Use readonly for immutable properties
- **SHOULD**: Prefer interfaces over types for object shapes
- **SHOULD**: Use enums for fixed sets of values

### Naming Conventions
```typescript
// Classes: PascalCase
class UserController {}

// Interfaces: PascalCase with 'I' prefix or descriptive name
interface IUserRepository {}
interface CreateUserRequest {}

// Methods and variables: camelCase
const createUser = async () => {};
const userId = 'uuid';

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;

// Files: PascalCase for classes, camelCase for others
UserController.ts
createUserHelper.ts
```

### Type Safety
```typescript
// ✅ Good - Explicit types
interface CreateUserRequest {
  readonly email: string;
  readonly name: string;
  readonly createdBy?: UserInfo;
}

// ✅ Good - Generic constraints
interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
}

// ❌ Bad - Any type
const userData: any = request.body;

// ❌ Bad - Implicit any
function processData(data) {
  return data.value;
}
```

## Error Handling

### Standardized Error Response Format
All API responses must follow this standard format:

#### Success Response
```typescript
interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    pagination?: PaginationMeta;
    version?: string;
    [key: string]: unknown;
  };
  timestamp: string;
  traceId?: string;
}
```

#### Error Response
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // Standardized error code
    message: string;        // Human-readable message
    details?: unknown;      // Additional error context
    traceId?: string;       // For error tracking
  };
  timestamp: string;
  path: string;
}
```

### Standardized Error Codes
**MUST** use these exact error codes for HTTP responses:

| HTTP Status | Error Code | Usage |
|-------------|------------|-------|
| 400 | `common.invalid_request` | Validation errors, malformed requests |
| 401 | `common.unauthorized` | Authentication required |
| 403 | `common.forbidden` | Access denied, insufficient permissions |
| 404 | `common.not_found` | Resource not found |
| 409 | `common.conflict` | Resource conflict (e.g., duplicate email) |
| 422 | `common.unprocessable_entity` | Business logic validation errors |
| 500 | `common.internal_server_error` | Unexpected server errors |
| 502 | `common.bad_gateway` | External service errors |
| 503 | `common.service_unavailable` | Service temporarily unavailable |
| 504 | `common.gateway_timeout` | External service timeout |

### Error Class Hierarchy
```typescript
// ✅ Good - Use standardized error classes
class ValidationError extends BaseError {
  readonly statusCode = 400;
  readonly errorCode = 'common.invalid_request';
}

class UnauthorizedError extends BaseError {
  readonly statusCode = 401;
  readonly errorCode = 'common.unauthorized';
}

class ForbiddenError extends BaseError {
  readonly statusCode = 403;
  readonly errorCode = 'common.forbidden';
}

class NotFoundError extends BaseError {
  readonly statusCode = 404;
  readonly errorCode = 'common.not_found';
}

class ConflictError extends BaseError {
  readonly statusCode = 409;
  readonly errorCode = 'common.conflict';
}

class UnprocessableEntityError extends BaseError {
  readonly statusCode = 422;
  readonly errorCode = 'common.unprocessable_entity';
}

class InternalServerError extends BaseError {
  readonly statusCode = 500;
  readonly errorCode = 'common.internal_server_error';
}

class BadGatewayError extends BaseError {
  readonly statusCode = 502;
  readonly errorCode = 'common.bad_gateway';
}

class ServiceUnavailableError extends BaseError {
  readonly statusCode = 503;
  readonly errorCode = 'common.service_unavailable';
}

class GatewayTimeoutError extends BaseError {
  readonly statusCode = 504;
  readonly errorCode = 'common.gateway_timeout';
```

## API Design

### HTTP Methods and Status Codes
- **GET**: 200 (OK), 404 (Not Found)
- **POST**: 201 (Created), 202 (Accepted for async operations)
- **PUT**: 200 (OK), 404 (Not Found)
- **DELETE**: 200 (OK), 204 (No Content), 404 (Not Found)

### Request/Response Patterns
```typescript
// ✅ Good - Async operations return 202 Accepted
POST /users
Response: 202 Accepted
{
  "success": true,
  "data": {
    "id": "uuid",
    "message": "User creation initiated"
  },
  "timestamp": "2025-10-02T10:00:00Z"
}

// ✅ Good - Pagination metadata
GET /users?page=1&limit=10
Response: 200 OK
{
  "success": true,
  "data": {
    "users": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10,
      "hasNext": true,
      "hasPrev": false
    }
  },
  "timestamp": "2025-10-02T10:00:00Z"
}
```

### Controller Standards
```typescript
// ✅ Good - Controller implementation
export class UserController extends BaseController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase
  ) {
    super('UserService');
  }

  async createUser(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const span = this.startSpan('createUser');
    
    try {
      // Input validation
      const { email, name } = this.validateRequest<CreateUserRequest>(request.body);
      
      // Business logic
      const result = await this.createUserUseCase.execute({ email, name });
      
      // Success response
      return this.successResponse(reply, result, { statusCode: 202 });
    } catch (error) {
      return this.handleError(error, request, reply);
    } finally {
      span.end();
    }
  }
}
```

## Logging and Tracing

### OpenTelemetry Standards
```typescript
// ✅ Good - Span creation and attributes
const span = tracer.startSpan('operation.name');
span.setAttributes({
  'http.method': request.method,
  'http.url': request.url,
  'user.id': userId,
  'operation.success': true,
});
```

### Logging Standards
```typescript
// ✅ Good - Structured logging
logger.info({
  userId,
  operation: 'createUser',
  duration: Date.now() - startTime,
  result: 'success'
}, 'User created successfully');

// ✅ Good - Error logging
logger.error({
  error: error.message,
  stack: error.stack,
  userId,
  operation: 'createUser'
}, 'Failed to create user');
```

## Testing Standards

### Test Structure
```typescript
// ✅ Good - Test organization
describe('UserController', () => {
  describe('createUser', () => {
    describe('when valid input is provided', () => {
      it('should return 202 with user creation message', async () => {
        // Arrange
        const request = createMockRequest({ email: 'test@example.com', name: 'Test User' });
        
        // Act
        const response = await userController.createUser(request, reply);
        
        // Assert
        expect(response.statusCode).toBe(202);
        expect(response.body.success).toBe(true);
      });
    });

    describe('when invalid input is provided', () => {
      it('should return 400 with validation error', async () => {
        // Test implementation
      });
    });
  });
});
```

### Testing Guidelines
- **MUST**: Write unit tests for all use cases
- **MUST**: Write integration tests for repositories
- **MUST**: Mock external dependencies
- **SHOULD**: Aim for 80%+ code coverage
- **SHOULD**: Test both success and failure scenarios

## Code Quality

### ESLint Rules
```json
{
  "extends": [
    "@typescript-eslint/recommended",
    "@typescript-eslint/recommended-requiring-type-checking"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

### File Organization
- **MUST**: One class per file
- **MUST**: Export only what's needed
- **MUST**: Use index.ts for barrel exports
- **SHOULD**: Keep files under 300 lines
- **SHOULD**: Group related functionality in directories

### Performance Guidelines
- **MUST**: Use connection pooling for database
- **MUST**: Implement caching for frequently accessed data
- **MUST**: Use pagination for list endpoints
- **SHOULD**: Implement request timeouts
- **SHOULD**: Use compression for responses

### Security Guidelines
- **MUST**: Validate all input data
- **MUST**: Sanitize user input
- **MUST**: Use prepared statements for database queries
- **MUST**: Implement authentication and authorization
- **SHOULD**: Log security-related events
- **SHOULD**: Use HTTPS in production

## Enforcement

### Pre-commit Hooks
- **MUST**: Run ESLint and fix auto-fixable issues
- **MUST**: Run Prettier for code formatting
- **MUST**: Run type checking with TypeScript
- **SHOULD**: Run unit tests

### Code Review Checklist
- [ ] Follows Clean Architecture principles
- [ ] Uses standardized error handling
- [ ] Includes proper OpenTelemetry tracing
- [ ] Has appropriate unit tests
- [ ] Follows naming conventions
- [ ] Uses proper TypeScript types
- [ ] Includes proper documentation

## Migration Guide

### For Existing Code
1. Update error handling to use standardized error codes
2. Refactor controllers to extend BaseController
3. Add proper TypeScript types
4. Update tests to follow new patterns
5. Add OpenTelemetry spans to operations

### Breaking Changes
- Error response format changes
- Controller base class requirements
- Standardized error codes

## Examples

See the following files for implementation examples:
- `src/presentation/controllers/BaseController.ts` - Controller base class
- `src/shared/errors/ErrorTypes.ts` - Error definitions
- `src/presentation/controllers/ExampleUserController.ts` - Example implementation
    mockRequest = {
      headers: { authorization: 'Bearer valid-token' },
      url: '/api/users'
    };
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };
  });

  it('should authenticate valid token', async () => {
    await middleware.authenticate(
      mockRequest as FastifyRequest,
      mockReply as FastifyReply
    );
    
    expect(mockRequest.user).toBeDefined();
    expect(mockRequest.user?.id).toBe('user-id');
  });

  it('should handle missing token', async () => {
    delete mockRequest.headers?.authorization;
    
    await expect(
      middleware.authenticate(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      )
    ).rejects.toThrow(ValidationError);
  });
});
```

## Testing Standards

### Test File Structure

**STANDARD**: Name and structure test files consistently:

```
src/
├── domain/
│   └── entities/
│       ├── User.ts
│       └── User.test.ts
├── application/
│   └── usecases/
│       ├── CreateUserUseCaseImpl.ts
│       └── CreateUserUseCaseImpl.test.ts
└── infrastructure/
    └── repositories/
        ├── UserRepository.ts
        └── UserRepository.integration.test.ts
```

### Test Structure

**STANDARD**: Use this test structure:

```typescript
describe('ClassName', () => {
  // Test setup
  let instance: ClassName;
  let mockDependency: jest.Mocked<DependencyType>;

  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('methodName', () => {
    it('should handle successful case', async () => {
      // Arrange
      const input = { /* test data */ };
      mockDependency.method.mockResolvedValue(expectedResult);

      // Act
      const result = await instance.methodName(input);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockDependency.method).toHaveBeenCalledWith(input);
    });

    it('should handle error case', async () => {
      // Arrange
      const input = { /* test data */ };
      mockDependency.method.mockRejectedValue(new ValidationError('Test error'));

      // Act & Assert
      await expect(instance.methodName(input)).rejects.toThrow(ValidationError);
    });
  });
});
```

## Documentation Standards

### Code Comments

**STANDARD**: Use JSDoc for public APIs:

```typescript
/**
 * Creates a new user in the system
 * 
 * @param request - The user creation request
 * @param request.email - User's email address
 * @param request.name - User's full name
 * @param request.createdBy - Information about who created the user
 * @returns Promise resolving to the created user with ID and version
 * 
 * @throws {ValidationError} When input validation fails
 * @throws {ConflictError} When user with email already exists
 * 
 * @example
 * ```typescript
 * const user = await createUser({
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   createdBy: { id: '123', name: 'Admin', email: 'admin@example.com' }
 * });
 * ```
 */
async createUser(request: CreateUserRequest): Promise<CreateUserResponse> {
  // Implementation
}
```

### README Structure

**STANDARD**: Every module should have a README with:

1. **Purpose**: What this module does
2. **Architecture**: How it fits in the system
3. **Usage**: How to use the module
4. **Dependencies**: What it depends on
5. **Testing**: How to run tests
6. **Examples**: Code examples

## Enforcement

### ESLint Rules

These standards are enforced by ESLint with custom rules:

- No direct error responses (must use ErrorHandler)
- No direct success responses (must use BaseController methods)
- Required tracing spans for all public methods
- Consistent import ordering
- Naming convention enforcement

### Code Review Checklist

Before approving any PR, ensure:

- [ ] All error handling follows standard patterns
- [ ] Response formats are consistent
- [ ] Tracing is properly implemented
- [ ] Logging includes relevant context
- [ ] Tests cover both success and error cases
- [ ] Documentation is updated
- [ ] No duplicate code patterns

### VS Code Snippets

Use provided code snippets for:

- Controller method templates
- Error handling patterns
- Test case structures
- Use case implementations

---

**Remember**: These standards exist to ensure consistency and maintainability. When in doubt, refer to existing well-structured code in the codebase or ask for guidance.
