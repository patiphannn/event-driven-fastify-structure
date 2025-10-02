# Developer Guide for Junior Developers

Welcome to the User Service project! This guide will help you understand our coding standards, development workflow, and best practices.

## Quick Start

### 1. Setup Development Environment

```bash
# Install dependencies
npm install

# Setup database
npm run db:generate
npm run db:migrate

# Start development server
npm run dev
```

### 2. VS Code Setup

This project includes VS Code snippets and tasks to help you develop faster:

- **Snippets**: Type prefixes like `ctrl-method`, `usecase`, `test-case` and press Tab
- **Tasks**: Use Ctrl+Shift+P → "Tasks: Run Task" to access predefined tasks
- **Extensions**: Install recommended TypeScript and ESLint extensions

## Coding Standards Overview

### 🚨 Critical Rules (Will break builds)

1. **Always extend BaseController** for new controllers
2. **Use ErrorHandler.handle()** instead of direct error responses
3. **Include tracing spans** in all public controller methods
4. **Follow naming conventions**: PascalCase for classes, camelCase for variables
5. **Use standardized error types** from `src/shared/errors`

### 📋 Code Templates

Use these VS Code snippets for consistency:

#### Controller Method (`ctrl-method`)
```typescript
async methodName(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
  const span = this.startSpan('methodName');
  
  try {
    // Add request attributes
    this.addRequestAttributes(span, request.method, request.url);
    
    // Your business logic here
    const result = await this.useCase.execute(params);
    
    // Add success attributes
    this.addSuccessAttributes(span, 200);
    
    return this.successResponse(reply, result);
    
  } catch (error) {
    return this.errorHandler.handle(error, request, reply, span);
  } finally {
    span.end();
  }
}
```

#### Error Throwing (`throw-error`)
```typescript
throw new ValidationError('Email is required', { field: 'email' });
```

#### Use Case (`usecase`)
Creates a complete use case implementation with proper structure.

#### Test Case (`test-case`)
Creates test with arrange-act-assert pattern.

## Common Patterns

### 1. Controller Structure

```typescript
export class UserController extends BaseController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase
  ) {
    super(CONFIG.SERVICE_NAME);
  }

  // Always use this pattern for controller methods
  async createUser(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    // Use ctrl-method snippet
  }
}
```

### 2. Error Handling

```typescript
// ✅ DO: Use specific error types
throw new ValidationError('Email is required');
throw new NotFoundError('User not found');
throw new ConflictError('Email already exists');

// ❌ DON'T: Use generic Error
throw new Error('Something went wrong');

// ❌ DON'T: Direct error responses
return reply.status(400).send({ error: 'Bad request' });
```

### 3. Response Formats

```typescript
// ✅ DO: Use BaseController methods
return this.successResponse(reply, userData);
return this.createdResponse(reply, newUser);
return this.acceptedResponse(reply, { id: user.id });
return this.paginatedResponse(reply, users, pagination);

// ❌ DON'T: Direct responses
return reply.send(userData);
return reply.status(201).send(newUser);
```

### 4. Logging and Tracing

```typescript
// ✅ DO: Include context in logs
this.logOperationStart('createUser', { email, name });
this.logOperationSuccess('createUser', { userId: result.id });

// ✅ DO: Add meaningful span attributes
span.setAttributes({
  'user.email': email,
  'user.id': result.id,
  'operation.type': 'create'
});

// ❌ DON'T: Use console.log
console.log('Creating user:', userData);
```

## Development Workflow

### 1. Before Starting Work

1. Pull latest changes: `git pull origin main`
2. Install dependencies: `npm install`
3. Run migrations: `npm run db:migrate`
4. Start development server: `npm run dev`

### 2. While Developing

1. **Use snippets** for consistent code structure
2. **Run tests frequently**: `npm test`
3. **Check linting**: `npm run lint`
4. **Follow the coding standards** in CODING_STANDARDS.md

### 3. Before Committing

1. **Run all tests**: `npm run test:all`
2. **Fix linting issues**: `npm run lint -- --fix`
3. **Check test coverage**: `npm run test:coverage`
4. **Verify build**: `npm run build`

### 4. Code Review Checklist

Before submitting a PR, ensure:

- [ ] All tests pass
- [ ] Code follows naming conventions
- [ ] Error handling uses standardized patterns
- [ ] Controllers extend BaseController
- [ ] Tracing spans are included
- [ ] Logs include relevant context
- [ ] No direct error/success responses
- [ ] Documentation is updated

## Common Mistakes to Avoid

### ❌ Direct Error Responses
```typescript
// DON'T DO THIS
return reply.status(400).send({
  error: 'Validation Error',
  message: 'Email is required'
});
```

### ✅ Use ErrorHandler
```typescript
// DO THIS INSTEAD
throw new ValidationError('Email is required');
// ErrorHandler will format the response automatically
```

### ❌ Missing Tracing
```typescript
// DON'T DO THIS
async createUser(request: FastifyRequest, reply: FastifyReply) {
  const result = await this.useCase.execute(data);
  return reply.send(result);
}
```

### ✅ Proper Tracing
```typescript
// DO THIS INSTEAD
async createUser(request: FastifyRequest, reply: FastifyReply) {
  const span = this.startSpan('createUser');
  try {
    // ... business logic
    return this.successResponse(reply, result);
  } catch (error) {
    return this.errorHandler.handle(error, request, reply, span);
  } finally {
    span.end();
  }
}
```

### ❌ Inconsistent Naming
```typescript
// DON'T DO THIS
const User_name = 'John';
const userEmail = 'john@example.com';
class userController { }
interface createUserRequest { }
```

### ✅ Consistent Naming
```typescript
// DO THIS INSTEAD
const userName = 'John';
const userEmail = 'john@example.com';
class UserController extends BaseController { }
interface CreateUserRequest { }
```

## File Structure

When creating new files, follow this structure:

```
src/
├── application/
│   ├── ports/           # Use case interfaces
│   └── usecases/        # Use case implementations
├── domain/
│   ├── entities/        # Business entities
│   ├── events/          # Domain events
│   └── repositories/    # Repository interfaces
├── infrastructure/
│   ├── database/        # Database implementations
│   ├── repositories/    # Repository implementations
│   └── cache/           # Cache implementations
├── presentation/
│   ├── controllers/     # HTTP controllers
│   └── routes/          # Route definitions
└── shared/
    ├── errors/          # Error definitions
    ├── types/           # Shared types
    └── utils/           # Utility functions
```

## Testing Guidelines

### 1. Test Structure
```typescript
describe('UserController', () => {
  describe('createUser', () => {
    it('should create user successfully', async () => {
      // Arrange - setup test data and mocks
      // Act - execute the operation
      // Assert - verify the results
    });

    it('should handle validation errors', async () => {
      // Test error scenarios
    });
  });
});
```

### 2. Test Coverage
- **Unit tests**: Test individual components in isolation
- **Integration tests**: Test component interactions
- **Aim for >80% coverage**: Run `npm run test:coverage`

### 3. Mock External Dependencies
```typescript
const mockRepository = {
  findByEmail: jest.fn(),
  save: jest.fn(),
} as jest.Mocked<UserRepository>;
```

## Getting Help

1. **Read the CODING_STANDARDS.md** for detailed guidelines
2. **Use VS Code snippets** for common patterns
3. **Check existing code** for examples
4. **Ask for code review** when unsure
5. **Run linting** to catch common issues: `npm run lint`

## Useful Commands

```bash
# Development
npm run dev              # Start development server
npm run build           # Build for production
npm test               # Run tests
npm run test:coverage  # Run tests with coverage
npm run lint           # Check code style
npm run lint -- --fix  # Fix auto-fixable issues

# Database
npm run db:migrate     # Run database migrations
npm run db:generate    # Generate Prisma client
npm run db:studio      # Open database browser

# VS Code Tasks (Ctrl+Shift+P → Tasks: Run Task)
- Start Development Server
- Run Tests with Coverage
- Lint and Fix Code
- Database: Run Migrations
```

Remember: **Consistency is key!** Following these patterns makes the code easier to read, maintain, and debug for everyone on the team.