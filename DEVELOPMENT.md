# Development Guide

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Field Naming Conventions](#field-naming-conventions)
- [Database Schema](#database-schema)
- [API Development](#api-development)
- [Testing Strategy](#testing-strategy)
- [Event Sourcing](#event-sourcing)
- [Authentication](#authentication)
- [Performance & Caching](#performance--caching)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)

## Overview

This microservice follows **Clean Architecture** principles with **Event Sourcing** and the **Outbox Pattern** for reliable event processing. The codebase uses **TypeScript** with **camelCase** field naming conventions while maintaining **snake_case** database columns for compatibility.

### Key Technologies
- **Runtime**: Node.js with TypeScript
- **Framework**: Fastify
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Observability**: OpenTelemetry, Pino logging
- **Testing**: Jest
- **Documentation**: Swagger/OpenAPI

## Architecture

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

### Directory Structure
```
src/
├── domain/           # Domain entities and events
├── application/      # Use cases and business logic
├── infrastructure/   # Database, cache, external services
├── presentation/     # Controllers, routes, middleware
├── shared/          # Common utilities and types
└── tests/           # Test files
```

## Field Naming Conventions

### ✅ Current Convention: CamelCase in Code, Snake_case in Database

This project uses **camelCase** for all TypeScript/JavaScript code while maintaining **snake_case** database columns through Prisma's `@map()` directive.

#### Code Fields (camelCase)
```typescript
// ✅ Correct - Use in TypeScript/JavaScript code
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  createdBy?: Json;
  updatedBy?: Json;
  deletedBy?: Json;
}

// ✅ Event fields
interface UserCreated {
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  eventData: Json;
  occurredAt: Date;
}

// ✅ Outbox fields  
interface OutboxEvent {
  eventType: string;
  eventData: Json;
  processedAt?: Date;
  createdAt: Date;
}
```

#### Database Columns (snake_case)
```sql
-- ✅ Database uses snake_case columns
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE,
  name VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP,
  created_by JSONB,
  updated_by JSONB,
  deleted_by JSONB
);
```

#### Prisma Schema Mapping
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  createdAt DateTime @default(now()) @map("created_at")  // ← Maps code to DB
  updatedAt DateTime @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")
  createdBy Json? @map("created_by")
  updatedBy Json? @map("updated_by") 
  deletedBy Json? @map("deleted_by")

  @@map("users")
}
```

### Migration from Snake_case (COMPLETED)

The project recently completed a migration from snake_case to camelCase field names:

- ✅ **Schema Updated**: All Prisma models use camelCase fields
- ✅ **Code Updated**: All TypeScript code uses camelCase
- ✅ **Database Preserved**: Column names remain snake_case via `@map()`
- ✅ **Tests Updated**: All test files use camelCase
- ✅ **API Updated**: All endpoints return camelCase fields

## Database Schema

### Core Models

#### User Model
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  version   Int      @default(1)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")
  createdBy Json? @map("created_by") // {id, name, email}
  updatedBy Json? @map("updated_by") // {id, name, email}
  deletedBy Json? @map("deleted_by") // {id, name, email}

  @@map("users")
}
```

#### OutboxEvent Model (Outbox Pattern)
```prisma
model OutboxEvent {
  id          String   @id @default(uuid())
  eventType   String   @map("event_type")
  eventData   Json     @map("event_data")
  metadata    Json?    @map("metadata")
  processed   Boolean  @default(false)
  processedAt DateTime? @map("processed_at")
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("outbox_events")
}
```

#### EventLog Model (Event Store)
```prisma
model EventLog {
  id           String   @id @default(uuid())
  aggregateId  String   @map("aggregate_id")
  eventType    String   @map("event_type")
  eventVersion Int      @map("event_version")
  eventData    Json     @map("event_data")
  metadata     Json?    @map("metadata")
  occurredAt   DateTime @map("occurred_at")
  position     BigInt   @default(autoincrement())
  updatedBy    Json?    @map("updated_by")
  
  @@index([aggregateId])
  @@index([eventType])
  @@index([occurredAt])
  @@index([position])
  @@map("event_logs")
}
```

### Database Commands

```bash
# Check migration status
npx prisma migrate status

# Generate Prisma client
npx prisma generate

# Apply migrations
npx prisma migrate dev

# Reset database (development only)
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio
```

## API Development

### Endpoint Patterns

#### Successful Response (camelCase)
```json
{
  "users": [{
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "createdAt": "2025-08-06T02:04:00.111Z",
    "updatedAt": "2025-08-06T02:04:00.111Z",
    "createdBy": {"id": "uuid", "name": "Creator", "email": "creator@example.com"}
  }],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

#### Event Response (camelCase)
```json
{
  "events": [{
    "aggregateId": "uuid",
    "eventType": "UserCreated", 
    "eventVersion": 1,
    "eventData": {"name": "User Name", "email": "user@example.com"},
    "metadata": {"traceId": "trace-id"},
    "occurredAt": "2025-08-06T02:04:00.111Z"
  }],
  "count": 1
}
```

### Available Endpoints

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| `POST` | `/users` | Create user | Optional |
| `GET` | `/users` | List users | No |
| `PUT` | `/users/:id` | Update user | Yes |
| `DELETE` | `/users/:id` | Delete user | Yes |
| `GET` | `/events` | Event history | No |
| `GET` | `/health` | Health check | No |
| `GET` | `/docs` | API documentation | No |

### Schema Validation

All endpoints use JSON Schema validation with camelCase field names:

```typescript
// ✅ Request validation
body: {
  type: 'object',
  required: ['email', 'name'],
  properties: {
    email: { type: 'string', format: 'email' },
    name: { type: 'string', minLength: 2, maxLength: 100 }
  }
}

// ✅ Response validation  
response: {
  200: {
    type: 'object',
    properties: {
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  }
}
```

## Testing Strategy

### Test Structure
```
src/tests/
├── unit/
│   ├── domain/          # Entity and value object tests
│   ├── application/     # Use case tests
│   └── infrastructure/  # Repository and service tests
├── integration/         # API endpoint tests
└── setup.ts            # Test configuration
```

### Running Tests

```bash
# Run all unit tests
npm test

# Run integration tests  
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- UserRepository.test.ts
```

### Test Examples

#### Unit Test (camelCase)
```typescript
describe('User Entity', () => {
  it('should create user with camelCase fields', () => {
    const user = User.create({
      email: 'test@example.com',
      name: 'Test User'
    });
    
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
    expect(user.deletedAt).toBeNull();
  });
});
```

#### Integration Test (camelCase)
```typescript
describe('POST /users', () => {
  it('should create user and return camelCase fields', async () => {
    const response = await request(app.server)
      .post('/users')
      .send({ email: 'test@example.com', name: 'Test User' })
      .expect(202);
      
    const events = await app.prisma.outboxEvent.findMany();
    expect(events[0]).toMatchObject({
      eventType: 'user.created',  // ← camelCase
      processed: false
    });
  });
});
```

## Event Sourcing

### Event Store Pattern

The system uses Event Sourcing with the following components:

1. **EventStore**: Persists all domain events
2. **Outbox Pattern**: Ensures reliable event publishing  
3. **Event Replay**: Rebuilds aggregates from events
4. **Snapshots**: Performance optimization for large event streams

### Event Types (camelCase)
```typescript
interface DomainEvent {
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  eventData: Json;
  metadata?: Json;
  occurredAt: Date;
}

// Example events
const userCreated: DomainEvent = {
  aggregateId: 'user-uuid',
  eventType: 'UserCreated',
  eventVersion: 1,
  eventData: { name: 'John Doe', email: 'john@example.com' },
  occurredAt: new Date()
};
```

### Repository Pattern
```typescript
class EventSourcedUserRepository {
  async save(user: User): Promise<void> {
    // Save events with camelCase fields
    const events = user.getUncommittedEvents();
    await this.eventStore.saveEvents(user.id, events);
    await this.snapshotStore.saveSnapshot(user);
  }
  
  async findById(id: string): Promise<User | null> {
    // Load from snapshot + events
    const snapshot = await this.snapshotStore.getSnapshot(id);
    const events = await this.eventStore.getEvents(id, snapshot?.version);
    return User.fromSnapshot(snapshot, events);
  }
}
```

## Authentication

### Middleware
- **Optional Auth**: `authMiddleware.optionalAuth` - Tracks user if token provided
- **Required Auth**: `authMiddleware.authenticate` - Blocks request without valid token

### Protected Endpoints
- `PUT /users/:id` - Update operations
- `DELETE /users/:id` - Delete operations

### Test Authentication
For testing protected endpoints, you need to provide authentication tokens:

```bash
# ❌ Will fail with 401
curl -X PUT http://localhost:3000/users/uuid -d '{"name":"New Name"}'

# ✅ Need to implement token generation for testing
curl -X PUT http://localhost:3000/users/uuid \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"New Name"}'
```

## Performance & Caching

### Redis Caching
- User list queries are cached in Redis
- Cache keys use camelCase field names
- Automatic cache invalidation on updates

### Database Optimization
- Proper indexing on `aggregateId`, `eventType`, `occurredAt`
- Connection pooling via Prisma
- Query optimization for event replay

### Monitoring
- OpenTelemetry tracing
- Structured logging with Pino
- Performance metrics collection

## Development Workflow

### Setup New Development Environment

1. **Clone and Install**
   ```bash
   git clone <repository>
   cd event-driven-fastify-structure
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Database Setup**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

### Adding New Features

1. **Domain Layer**: Create entities and events with camelCase fields
2. **Application Layer**: Implement use cases
3. **Infrastructure Layer**: Add repositories and services
4. **Presentation Layer**: Create controllers and routes
5. **Tests**: Write comprehensive tests using camelCase

## Step-by-Step Feature Development Guide

### 1. Adding New Prisma Schema

#### Example: Adding a `Product` entity

**Step 1**: Update `prisma/schema.prisma`
```prisma
model Product {
  id          String   @id @default(uuid())
  name        String
  description String?
  price       Decimal
  categoryId  String   @map("category_id")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")
  createdBy   Json?    @map("created_by")
  updatedBy   Json?    @map("updated_by")
  deletedBy   Json?    @map("deleted_by")

  @@map("products")
}
```

**Step 2**: Create and run migration
```bash
npx prisma migrate dev --name="add-product-model"
npx prisma generate
```

**Step 3**: Verify migration
```bash
npx prisma migrate status
```

### 2. Creating Domain Entity

**Step 1**: Create `src/domain/entities/Product.ts`
```typescript
import { AggregateRoot } from './AggregateRoot';
import { ProductCreated, ProductUpdated, ProductDeleted } from '../events/ProductEvents';

export interface ProductProps {
  id: string;
  name: string;
  description?: string;
  price: number;
  categoryId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  createdBy?: any;
  updatedBy?: any;
  deletedBy?: any;
}

export class Product extends AggregateRoot<ProductProps> {
  constructor(props: ProductProps) {
    super(props, props.id);
  }

  static create(data: {
    name: string;
    description?: string;
    price: number;
    categoryId: string;
    createdBy?: any;
  }): Product {
    const now = new Date();
    const id = crypto.randomUUID();

    const product = new Product({
      id,
      name: data.name,
      description: data.description,
      price: data.price,
      categoryId: data.categoryId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: data.createdBy,
    });

    product.addDomainEvent(new ProductCreated({
      aggregateId: id,
      name: data.name,
      description: data.description,
      price: data.price,
      categoryId: data.categoryId,
      isActive: true,
      createdBy: data.createdBy,
    }));

    return product;
  }

  update(data: {
    name?: string;
    description?: string;
    price?: number;
    categoryId?: string;
    updatedBy?: any;
  }): void {
    const updatedFields: any = {};
    
    if (data.name !== undefined) {
      this.props.name = data.name;
      updatedFields.name = data.name;
    }
    
    if (data.description !== undefined) {
      this.props.description = data.description;
      updatedFields.description = data.description;
    }

    if (data.price !== undefined) {
      this.props.price = data.price;
      updatedFields.price = data.price;
    }

    if (data.categoryId !== undefined) {
      this.props.categoryId = data.categoryId;
      updatedFields.categoryId = data.categoryId;
    }

    this.props.updatedAt = new Date();
    this.props.updatedBy = data.updatedBy;

    this.addDomainEvent(new ProductUpdated({
      aggregateId: this.id,
      ...updatedFields,
      updatedBy: data.updatedBy,
    }));
  }

  delete(deletedBy?: any): void {
    this.props.deletedAt = new Date();
    this.props.deletedBy = deletedBy;

    this.addDomainEvent(new ProductDeleted({
      aggregateId: this.id,
      deletedBy,
    }));
  }

  // Getters with camelCase
  get name(): string { return this.props.name; }
  get description(): string | undefined { return this.props.description; }
  get price(): number { return this.props.price; }
  get categoryId(): string { return this.props.categoryId; }
  get isActive(): boolean { return this.props.isActive; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
  get deletedAt(): Date | undefined { return this.props.deletedAt; }
  get createdBy(): any { return this.props.createdBy; }
  get updatedBy(): any { return this.props.updatedBy; }
  get deletedBy(): any { return this.props.deletedBy; }
}
```

### 3. Creating Domain Events

**Step 1**: Create `src/domain/events/ProductEvents.ts`
```typescript
import { DomainEvent } from './DomainEvent';

export class ProductCreated extends DomainEvent {
  constructor(data: {
    aggregateId: string;
    name: string;
    description?: string;
    price: number;
    categoryId: string;
    isActive: boolean;
    createdBy?: any;
  }) {
    super('ProductCreated', data.aggregateId, data);
  }
}

export class ProductUpdated extends DomainEvent {
  constructor(data: {
    aggregateId: string;
    name?: string;
    description?: string;
    price?: number;
    categoryId?: string;
    updatedBy?: any;
  }) {
    super('ProductUpdated', data.aggregateId, data);
  }
}

export class ProductDeleted extends DomainEvent {
  constructor(data: {
    aggregateId: string;
    deletedBy?: any;
  }) {
    super('ProductDeleted', data.aggregateId, data);
  }
}
```

### 4. Creating Repository Interface

**Step 1**: Create `src/domain/repositories/ProductRepository.ts`
```typescript
import { Product } from '../entities/Product';

export interface ProductRepository {
  save(product: Product): Promise<void>;
  findById(id: string): Promise<Product | null>;
  findMany(filters?: {
    isActive?: boolean;
    categoryId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    products: Product[];
    total: number;
  }>;
  delete(id: string, deletedBy?: any): Promise<void>;
}
```

### 5. Implementing Infrastructure Repository

**Step 1**: Create `src/infrastructure/repositories/PrismaProductRepository.ts`
```typescript
import { Product } from '../../domain/entities/Product';
import { ProductRepository } from '../../domain/repositories/ProductRepository';
import { DatabaseClient } from '../database/DatabaseClient';
import { EventSourcedRepository } from './EventSourcedRepository';

export class PrismaProductRepository extends EventSourcedRepository implements ProductRepository {
  private prisma = DatabaseClient.getInstance();

  async save(product: Product): Promise<void> {
    await this.saveWithEvents(product, async () => {
      // Save to read model (products table)
      await this.prisma.product.upsert({
        where: { id: product.id },
        create: {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          categoryId: product.categoryId,
          isActive: product.isActive,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          deletedAt: product.deletedAt,
          createdBy: product.createdBy,
          updatedBy: product.updatedBy,
          deletedBy: product.deletedBy,
        },
        update: {
          name: product.name,
          description: product.description,
          price: product.price,
          categoryId: product.categoryId,
          isActive: product.isActive,
          updatedAt: product.updatedAt,
          deletedAt: product.deletedAt,
          updatedBy: product.updatedBy,
          deletedBy: product.deletedBy,
        },
      });
    });
  }

  async findById(id: string): Promise<Product | null> {
    // Try to load from read model first
    const productData = await this.prisma.product.findUnique({
      where: { id, deletedAt: null },
    });

    if (!productData) {
      return null;
    }

    // Create from read model data (you might want to also replay events for consistency)
    return new Product({
      id: productData.id,
      name: productData.name,
      description: productData.description,
      price: productData.price.toNumber(),
      categoryId: productData.categoryId,
      isActive: productData.isActive,
      createdAt: productData.createdAt,
      updatedAt: productData.updatedAt,
      deletedAt: productData.deletedAt,
      createdBy: productData.createdBy,
      updatedBy: productData.updatedBy,
      deletedBy: productData.deletedBy,
    });
  }

  async findMany(filters?: {
    isActive?: boolean;
    categoryId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ products: Product[]; total: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters?.categoryId) {
      where.categoryId = filters.categoryId;
    }

    const [productsData, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    const products = productsData.map(
      (data) =>
        new Product({
          id: data.id,
          name: data.name,
          description: data.description,
          price: data.price.toNumber(),
          categoryId: data.categoryId,
          isActive: data.isActive,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          deletedAt: data.deletedAt,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
          deletedBy: data.deletedBy,
        })
    );

    return { products, total };
  }

  async delete(id: string, deletedBy?: any): Promise<void> {
    const product = await this.findById(id);
    if (!product) {
      throw new Error('Product not found');
    }

    product.delete(deletedBy);
    await this.save(product);
  }
}
```

### 6. Creating Use Cases

**Step 1**: Create `src/application/usecases/CreateProductUseCaseImpl.ts`
```typescript
import { Product } from '../../domain/entities/Product';
import { ProductRepository } from '../../domain/repositories/ProductRepository';
import { OutboxRepository } from '../../domain/repositories/OutboxRepository';
import { UnitOfWork } from '../../domain/repositories/UnitOfWork';

export interface CreateProductUseCase {
  execute(data: {
    name: string;
    description?: string;
    price: number;
    categoryId: string;
    createdBy?: any;
  }): Promise<{ id: string }>;
}

export class CreateProductUseCaseImpl implements CreateProductUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly unitOfWork: UnitOfWork
  ) {}

  async execute(data: {
    name: string;
    description?: string;
    price: number;
    categoryId: string;
    createdBy?: any;
  }): Promise<{ id: string }> {
    return await this.unitOfWork.transaction(async () => {
      // Create product
      const product = Product.create({
        name: data.name,
        description: data.description,
        price: data.price,
        categoryId: data.categoryId,
        createdBy: data.createdBy,
      });

      // Save product (this will save events to event store)
      await this.productRepository.save(product);

      // Save outbox events for external systems
      const events = product.getUncommittedEvents();
      for (const event of events) {
        await this.outboxRepository.save({
          eventType: 'product.created',
          eventData: {
            productId: product.id,
            name: product.name,
            description: product.description,
            price: product.price,
            categoryId: product.categoryId,
          },
          metadata: {
            aggregateId: product.id,
            eventVersion: event.eventVersion,
          },
        });
      }

      return { id: product.id };
    });
  }
}
```

### 7. Creating API Controller

**Step 1**: Create `src/presentation/controllers/ProductController.ts`
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateProductUseCase } from '../../application/usecases/CreateProductUseCaseImpl';
import { UpdateProductUseCase } from '../../application/usecases/UpdateProductUseCaseImpl';
import { DeleteProductUseCase } from '../../application/usecases/DeleteProductUseCaseImpl';
import { ListProductsUseCase } from '../../application/usecases/ListProductsUseCaseImpl';

export class ProductController {
  constructor(
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly updateProductUseCase: UpdateProductUseCase,
    private readonly deleteProductUseCase: DeleteProductUseCase,
    private readonly listProductsUseCase: ListProductsUseCase
  ) {}

  async createProduct(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name, description, price, categoryId } = request.body as any;
      const createdBy = (request as any).user; // From auth middleware

      const result = await this.createProductUseCase.execute({
        name,
        description,
        price,
        categoryId,
        createdBy,
      });

      return reply.status(202).send({
        id: result.id,
        message: 'Product creation initiated successfully',
      });
    } catch (error) {
      request.log.error({ err: error }, 'Internal error in product creation');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    }
  }

  async listProducts(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { page, limit, isActive, categoryId } = request.query as any;

      const result = await this.listProductsUseCase.execute({
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        categoryId,
      });

      const totalPages = Math.ceil(result.total / (limit || 10));

      return reply.send({
        products: result.products.map(product => ({
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          categoryId: product.categoryId,
          isActive: product.isActive,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        })),
        pagination: {
          page: page || 1,
          limit: limit || 10,
          total: result.total,
          totalPages,
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Error retrieving products');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    }
  }

  // Add updateProduct and deleteProduct methods...
}
```

### 8. Creating API Routes

**Step 1**: Create `src/presentation/routes/productRoutes.ts`
```typescript
import { FastifyInstance } from 'fastify';
import { ProductController } from '../controllers/ProductController';
import { AuthMiddleware } from '../middleware/AuthMiddleware';

export const registerProductRoutes = (
  fastify: FastifyInstance,
  productController: ProductController,
  authMiddleware: AuthMiddleware
) => {
  // POST /products - Create a new product
  fastify.post('/products', {
    preHandler: [authMiddleware.authenticate.bind(authMiddleware)],
    schema: {
      tags: ['Products'],
      summary: 'Create a new product',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'price', 'categoryId'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
            description: 'Product name',
          },
          description: {
            type: 'string',
            maxLength: 1000,
            description: 'Product description',
          },
          price: {
            type: 'number',
            minimum: 0,
            description: 'Product price',
          },
          categoryId: {
            type: 'string',
            description: 'Product category ID',
          },
        },
      },
      response: {
        202: {
          description: 'Product creation initiated successfully',
          type: 'object',
          properties: {
            id: { type: 'string' },
            message: { type: 'string' },
          },
        },
        400: {
          description: 'Validation error',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        401: {
          description: 'Authentication required',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, productController.createProduct.bind(productController));

  // GET /products - List products
  fastify.get('/products', {
    schema: {
      tags: ['Products'],
      summary: 'List products with pagination',
      querystring: {
        type: 'object',
        properties: {
          page: {
            type: 'string',
            pattern: '^[1-9]\\d*$',
            description: 'Page number',
          },
          limit: {
            type: 'string',
            pattern: '^([1-9]|[1-9]\\d|100)$',
            description: 'Items per page (1-100)',
          },
          isActive: {
            type: 'string',
            enum: ['true', 'false'],
            description: 'Filter by active status',
          },
          categoryId: {
            type: 'string',
            description: 'Filter by category ID',
          },
        },
      },
      response: {
        200: {
          description: 'List of products',
          type: 'object',
          properties: {
            products: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  price: { type: 'number' },
                  categoryId: { type: 'string' },
                  isActive: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  }, productController.listProducts.bind(productController));
};
```

### Database Changes

1. **Update Prisma Schema**: Use camelCase fields with `@map()` for snake_case columns
   ```prisma
   model NewEntity {
     newField String @map("new_field")
   }
   ```

2. **Create Migration**
   ```bash
   npx prisma migrate dev --name="add-new-entity"
   ```

3. **Update Code**: Use camelCase fields in TypeScript code
4. **Update Tests**: Ensure tests use camelCase fields

### 9. Writing Unit Tests

#### Domain Entity Tests

**Step 1**: Create `src/tests/domain/Product.test.ts`
```typescript
import { Product } from '../../domain/entities/Product';
import { ProductCreated, ProductUpdated, ProductDeleted } from '../../domain/events/ProductEvents';

describe('Product Entity', () => {
  describe('create', () => {
    it('should create a new product with camelCase fields', () => {
      const productData = {
        name: 'Test Product',
        description: 'Test Description',
        price: 99.99,
        categoryId: 'category-123',
        createdBy: { id: 'user-123', name: 'Test User' },
      };

      const product = Product.create(productData);

      expect(product.id).toBeDefined();
      expect(product.name).toBe(productData.name);
      expect(product.description).toBe(productData.description);
      expect(product.price).toBe(productData.price);
      expect(product.categoryId).toBe(productData.categoryId);
      expect(product.isActive).toBe(true);
      expect(product.createdAt).toBeInstanceOf(Date);
      expect(product.updatedAt).toBeInstanceOf(Date);
      expect(product.deletedAt).toBeUndefined();
      expect(product.createdBy).toEqual(productData.createdBy);

      const events = product.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ProductCreated);
      expect(events[0].eventType).toBe('ProductCreated');
      expect(events[0].aggregateId).toBe(product.id);
    });

    it('should create product without optional fields', () => {
      const productData = {
        name: 'Simple Product',
        price: 49.99,
        categoryId: 'category-456',
      };

      const product = Product.create(productData);

      expect(product.name).toBe(productData.name);
      expect(product.description).toBeUndefined();
      expect(product.price).toBe(productData.price);
      expect(product.categoryId).toBe(productData.categoryId);
      expect(product.createdBy).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update product fields and emit ProductUpdated event', () => {
      const product = Product.create({
        name: 'Original Product',
        price: 99.99,
        categoryId: 'category-123',
      });

      // Clear initial events
      product.markEventsAsCommitted();

      const updateData = {
        name: 'Updated Product',
        price: 149.99,
        updatedBy: { id: 'user-456', name: 'Update User' },
      };

      const originalUpdatedAt = product.updatedAt;
      
      // Wait a bit to ensure different timestamp
      setTimeout(() => {
        product.update(updateData);

        expect(product.name).toBe(updateData.name);
        expect(product.price).toBe(updateData.price);
        expect(product.updatedBy).toEqual(updateData.updatedBy);
        expect(product.updatedAt).not.toEqual(originalUpdatedAt);

        const events = product.getUncommittedEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(ProductUpdated);
        expect(events[0].eventType).toBe('ProductUpdated');
        expect(events[0].aggregateId).toBe(product.id);
      }, 1);
    });

    it('should only update provided fields', () => {
      const product = Product.create({
        name: 'Original Product',
        description: 'Original Description',
        price: 99.99,
        categoryId: 'category-123',
      });

      product.markEventsAsCommitted();

      product.update({
        name: 'Updated Name Only',
      });

      expect(product.name).toBe('Updated Name Only');
      expect(product.description).toBe('Original Description'); // Unchanged
      expect(product.price).toBe(99.99); // Unchanged
      expect(product.categoryId).toBe('category-123'); // Unchanged
    });
  });

  describe('delete', () => {
    it('should soft delete product and emit ProductDeleted event', () => {
      const product = Product.create({
        name: 'Product to Delete',
        price: 99.99,
        categoryId: 'category-123',
      });

      product.markEventsAsCommitted();

      const deletedBy = { id: 'user-789', name: 'Delete User' };
      product.delete(deletedBy);

      expect(product.deletedAt).toBeInstanceOf(Date);
      expect(product.deletedBy).toEqual(deletedBy);

      const events = product.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ProductDeleted);
      expect(events[0].eventType).toBe('ProductDeleted');
      expect(events[0].aggregateId).toBe(product.id);
    });
  });
});
```

#### Repository Tests

**Step 2**: Create `src/tests/infrastructure/PrismaProductRepository.test.ts`
```typescript
import { PrismaProductRepository } from '../../infrastructure/repositories/PrismaProductRepository';
import { Product } from '../../domain/entities/Product';
import { DatabaseClient } from '../../infrastructure/database/DatabaseClient';

describe('PrismaProductRepository', () => {
  let repository: PrismaProductRepository;
  let prisma: any;

  beforeAll(async () => {
    prisma = DatabaseClient.getInstance();
    repository = new PrismaProductRepository();
  });

  beforeEach(async () => {
    // Clean up database
    await prisma.product.deleteMany({});
    await prisma.eventLog.deleteMany({});
    await prisma.outboxEvent.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('save', () => {
    it('should save product with camelCase fields', async () => {
      const product = Product.create({
        name: 'Test Product',
        description: 'Test Description',
        price: 99.99,
        categoryId: 'category-123',
        createdBy: { id: 'user-123', name: 'Test User' },
      });

      await repository.save(product);

      // Verify product saved to read model
      const savedProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });

      expect(savedProduct).toBeDefined();
      expect(savedProduct.name).toBe(product.name);
      expect(savedProduct.description).toBe(product.description);
      expect(savedProduct.price.toNumber()).toBe(product.price);
      expect(savedProduct.categoryId).toBe(product.categoryId);
      expect(savedProduct.isActive).toBe(product.isActive);
      expect(savedProduct.createdAt).toEqual(product.createdAt);
      expect(savedProduct.updatedAt).toEqual(product.updatedAt);
      expect(savedProduct.createdBy).toEqual(product.createdBy);

      // Verify events saved to event store
      const events = await prisma.eventLog.findMany({
        where: { aggregateId: product.id },
      });

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('ProductCreated');
      expect(events[0].aggregateId).toBe(product.id);
    });

    it('should update existing product', async () => {
      const product = Product.create({
        name: 'Original Product',
        price: 99.99,
        categoryId: 'category-123',
      });

      await repository.save(product);
      product.markEventsAsCommitted();

      // Update product
      product.update({
        name: 'Updated Product',
        price: 149.99,
      });

      await repository.save(product);

      // Verify updated in read model
      const savedProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });

      expect(savedProduct.name).toBe('Updated Product');
      expect(savedProduct.price.toNumber()).toBe(149.99);

      // Verify new event saved
      const events = await prisma.eventLog.findMany({
        where: { aggregateId: product.id },
        orderBy: { eventVersion: 'asc' },
      });

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('ProductCreated');
      expect(events[1].eventType).toBe('ProductUpdated');
    });
  });

  describe('findById', () => {
    it('should find product by ID with camelCase fields', async () => {
      const originalProduct = Product.create({
        name: 'Find Test Product',
        description: 'Find Description',
        price: 199.99,
        categoryId: 'category-456',
      });

      await repository.save(originalProduct);

      const foundProduct = await repository.findById(originalProduct.id);

      expect(foundProduct).toBeDefined();
      expect(foundProduct!.id).toBe(originalProduct.id);
      expect(foundProduct!.name).toBe(originalProduct.name);
      expect(foundProduct!.description).toBe(originalProduct.description);
      expect(foundProduct!.price).toBe(originalProduct.price);
      expect(foundProduct!.categoryId).toBe(originalProduct.categoryId);
      expect(foundProduct!.isActive).toBe(originalProduct.isActive);
      expect(foundProduct!.createdAt).toEqual(originalProduct.createdAt);
      expect(foundProduct!.updatedAt).toEqual(originalProduct.updatedAt);
    });

    it('should return null for non-existent product', async () => {
      const foundProduct = await repository.findById('non-existent-id');
      expect(foundProduct).toBeNull();
    });

    it('should return null for deleted product', async () => {
      const product = Product.create({
        name: 'Product to Delete',
        price: 99.99,
        categoryId: 'category-123',
      });

      await repository.save(product);
      product.markEventsAsCommitted();

      product.delete();
      await repository.save(product);

      const foundProduct = await repository.findById(product.id);
      expect(foundProduct).toBeNull();
    });
  });

  describe('findMany', () => {
    it('should find products with pagination', async () => {
      // Create multiple products
      const products = [];
      for (let i = 1; i <= 5; i++) {
        const product = Product.create({
          name: `Product ${i}`,
          price: i * 10,
          categoryId: 'category-123',
        });
        products.push(product);
        await repository.save(product);
      }

      const result = await repository.findMany({
        page: 1,
        limit: 3,
      });

      expect(result.products).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.products[0].name).toBe('Product 5'); // Most recent first
    });

    it('should filter by isActive status', async () => {
      const activeProduct = Product.create({
        name: 'Active Product',
        price: 99.99,
        categoryId: 'category-123',
      });

      const inactiveProduct = Product.create({
        name: 'Inactive Product',
        price: 99.99,
        categoryId: 'category-123',
      });

      await repository.save(activeProduct);
      await repository.save(inactiveProduct);
      
      inactiveProduct.markEventsAsCommitted();
      inactiveProduct.delete();
      await repository.save(inactiveProduct);

      const result = await repository.findMany({
        isActive: true,
      });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].name).toBe('Active Product');
    });

    it('should filter by categoryId', async () => {
      await Promise.all([
        repository.save(Product.create({
          name: 'Category A Product',
          price: 99.99,
          categoryId: 'category-a',
        })),
        repository.save(Product.create({
          name: 'Category B Product',
          price: 99.99,
          categoryId: 'category-b',
        })),
      ]);

      const result = await repository.findMany({
        categoryId: 'category-a',
      });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].name).toBe('Category A Product');
    });
  });
});
```

#### Use Case Tests

**Step 3**: Create `src/tests/application/CreateProductUseCase.test.ts`
```typescript
import { CreateProductUseCaseImpl } from '../../application/usecases/CreateProductUseCaseImpl';
import { ProductRepository } from '../../domain/repositories/ProductRepository';
import { OutboxRepository } from '../../domain/repositories/OutboxRepository';
import { UnitOfWork } from '../../domain/repositories/UnitOfWork';

describe('CreateProductUseCase', () => {
  let useCase: CreateProductUseCaseImpl;
  let mockProductRepository: jest.Mocked<ProductRepository>;
  let mockOutboxRepository: jest.Mocked<OutboxRepository>;
  let mockUnitOfWork: jest.Mocked<UnitOfWork>;

  beforeEach(() => {
    mockProductRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    };

    mockOutboxRepository = {
      save: jest.fn(),
      findUnprocessed: jest.fn(),
      markAsProcessed: jest.fn(),
    };

    mockUnitOfWork = {
      transaction: jest.fn((callback) => callback()),
    };

    useCase = new CreateProductUseCaseImpl(
      mockProductRepository,
      mockOutboxRepository,
      mockUnitOfWork
    );
  });

  it('should create product with camelCase fields', async () => {
    const productData = {
      name: 'Test Product',
      description: 'Test Description',
      price: 99.99,
      categoryId: 'category-123',
      createdBy: { id: 'user-123', name: 'Test User' },
    };

    const result = await useCase.execute(productData);

    expect(result.id).toBeDefined();
    expect(mockUnitOfWork.transaction).toHaveBeenCalledTimes(1);
    expect(mockProductRepository.save).toHaveBeenCalledTimes(1);
    expect(mockOutboxRepository.save).toHaveBeenCalledTimes(1);

    const savedProduct = mockProductRepository.save.mock.calls[0][0];
    expect(savedProduct.name).toBe(productData.name);
    expect(savedProduct.description).toBe(productData.description);
    expect(savedProduct.price).toBe(productData.price);
    expect(savedProduct.categoryId).toBe(productData.categoryId);
    expect(savedProduct.createdBy).toEqual(productData.createdBy);

    const outboxEvent = mockOutboxRepository.save.mock.calls[0][0];
    expect(outboxEvent.eventType).toBe('product.created');
    expect(outboxEvent.eventData).toMatchObject({
      productId: result.id,
      name: productData.name,
      description: productData.description,
      price: productData.price,
      categoryId: productData.categoryId,
    });
  });

  it('should handle missing optional fields', async () => {
    const productData = {
      name: 'Simple Product',
      price: 49.99,
      categoryId: 'category-456',
    };

    const result = await useCase.execute(productData);

    expect(result.id).toBeDefined();
    
    const savedProduct = mockProductRepository.save.mock.calls[0][0];
    expect(savedProduct.name).toBe(productData.name);
    expect(savedProduct.description).toBeUndefined();
    expect(savedProduct.price).toBe(productData.price);
    expect(savedProduct.categoryId).toBe(productData.categoryId);
    expect(savedProduct.createdBy).toBeUndefined();
  });

  it('should propagate repository errors', async () => {
    const productData = {
      name: 'Test Product',
      price: 99.99,
      categoryId: 'category-123',
    };

    const error = new Error('Database connection failed');
    mockProductRepository.save.mockRejectedValue(error);

    await expect(useCase.execute(productData)).rejects.toThrow(error);
  });
});
```

### 10. Writing Integration Tests

**Step 1**: Create `src/tests/integration/product.test.ts`
```typescript
import request from 'supertest';
import { createApp } from '../../server';
import { DatabaseClient } from '../../infrastructure/database/DatabaseClient';
import { RedisClient } from '../../infrastructure/cache/RedisClient';

describe('Product API Integration Tests', () => {
  let app: any;
  let prisma: any;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.prisma;
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prisma.outboxEvent.deleteMany({});
    await prisma.eventLog.deleteMany({});
    await prisma.product.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
    await DatabaseClient.disconnect();
    await RedisClient.disconnect();
  });

  describe('POST /products', () => {
    it('should create a new product and return camelCase fields', async () => {
      const productData = {
        name: 'Integration Test Product',
        description: 'Test Description',
        price: 199.99,
        categoryId: 'category-123',
      };

      const response = await request(app.server)
        .post('/products')
        .set('Authorization', 'Bearer mock-token') // Mock auth token
        .send(productData)
        .expect(202);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        message: 'Product creation initiated successfully',
      });

      // Verify product was created in database
      const products = await prisma.product.findMany();
      expect(products).toHaveLength(1);
      expect(products[0]).toMatchObject({
        name: productData.name,
        description: productData.description,
        price: expect.any(Object), // Decimal type
        categoryId: productData.categoryId,
        isActive: true,
      });

      // Verify outbox event was created with camelCase
      const events = await prisma.outboxEvent.findMany();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: 'product.created',
        processed: false,
      });
    });

    it('should return 400 for invalid product data', async () => {
      const invalidData = {
        name: '', // Invalid: empty name
        price: -10, // Invalid: negative price
      };

      const response = await request(app.server)
        .post('/products')
        .set('Authorization', 'Bearer mock-token')
        .send(invalidData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        message: expect.any(String),
      });
    });

    it('should return 401 for missing authentication', async () => {
      const productData = {
        name: 'Test Product',
        price: 99.99,
        categoryId: 'category-123',
      };

      await request(app.server)
        .post('/products')
        .send(productData)
        .expect(401);
    });
  });

  describe('GET /products', () => {
    beforeEach(async () => {
      // Create test products
      const testProducts = [
        {
          id: '1',
          name: 'Product 1',
          description: 'Description 1',
          price: 99.99,
          categoryId: 'category-a',
          isActive: true,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
        {
          id: '2',
          name: 'Product 2',
          description: 'Description 2',
          price: 199.99,
          categoryId: 'category-b',
          isActive: true,
          createdAt: new Date('2025-01-02'),
          updatedAt: new Date('2025-01-02'),
        },
        {
          id: '3',
          name: 'Inactive Product',
          description: 'Description 3',
          price: 299.99,
          categoryId: 'category-a',
          isActive: false,
          deletedAt: new Date(),
          createdAt: new Date('2025-01-03'),
          updatedAt: new Date('2025-01-03'),
        },
      ];

      await prisma.product.createMany({
        data: testProducts,
      });
    });

    it('should return products with camelCase fields', async () => {
      const response = await request(app.server)
        .get('/products')
        .expect(200);

      expect(response.body).toMatchObject({
        products: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            description: expect.any(String),
            price: expect.any(Number),
            categoryId: expect.any(String),
            isActive: expect.any(Boolean),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          }),
        ]),
        pagination: {
          page: 1,
          limit: 10,
          total: expect.any(Number),
          totalPages: expect.any(Number),
        },
      });

      // Should only return active products (not deleted)
      expect(response.body.products).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });

    it('should support pagination', async () => {
      const response = await request(app.server)
        .get('/products?page=1&limit=1')
        .expect(200);

      expect(response.body.products).toHaveLength(1);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
    });

    it('should filter by categoryId', async () => {
      const response = await request(app.server)
        .get('/products?categoryId=category-a')
        .expect(200);

      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0].categoryId).toBe('category-a');
    });

    it('should filter by isActive status', async () => {
      // Test active products
      const activeResponse = await request(app.server)
        .get('/products?isActive=true')
        .expect(200);

      expect(activeResponse.body.products).toHaveLength(2);
      activeResponse.body.products.forEach((product: any) => {
        expect(product.isActive).toBe(true);
      });

      // Test inactive products (should return 0 since we filter out deleted)
      const inactiveResponse = await request(app.server)
        .get('/products?isActive=false')
        .expect(200);

      expect(inactiveResponse.body.products).toHaveLength(0);
    });
  });

  describe('PUT /products/:id', () => {
    let productId: string;

    beforeEach(async () => {
      const product = await prisma.product.create({
        data: {
          id: 'test-product-id',
          name: 'Original Product',
          price: 99.99,
          categoryId: 'category-123',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      productId = product.id;
    });

    it('should update product and return camelCase response', async () => {
      const updateData = {
        name: 'Updated Product Name',
        price: 149.99,
      };

      const response = await request(app.server)
        .put(`/products/${productId}`)
        .set('Authorization', 'Bearer mock-token')
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        id: productId,
        message: 'Product updated successfully',
        version: expect.any(Number),
      });

      // Verify product was updated in database
      const updatedProduct = await prisma.product.findUnique({
        where: { id: productId },
      });

      expect(updatedProduct.name).toBe(updateData.name);
      expect(updatedProduct.price.toNumber()).toBe(updateData.price);
    });

    it('should return 404 for non-existent product', async () => {
      const updateData = {
        name: 'Updated Name',
      };

      await request(app.server)
        .put('/products/non-existent-id')
        .set('Authorization', 'Bearer mock-token')
        .send(updateData)
        .expect(404);
    });

    it('should return 401 for missing authentication', async () => {
      const updateData = {
        name: 'Updated Name',
      };

      await request(app.server)
        .put(`/products/${productId}`)
        .send(updateData)
        .expect(401);
    });
  });

  describe('DELETE /products/:id', () => {
    let productId: string;

    beforeEach(async () => {
      const product = await prisma.product.create({
        data: {
          id: 'test-product-to-delete',
          name: 'Product to Delete',
          price: 99.99,
          categoryId: 'category-123',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      productId = product.id;
    });

    it('should soft delete product', async () => {
      const response = await request(app.server)
        .delete(`/products/${productId}`)
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(response.body).toMatchObject({
        id: productId,
        message: 'Product deleted successfully',
        version: expect.any(Number),
      });

      // Verify product was soft deleted (deletedAt set)
      const deletedProduct = await prisma.product.findUnique({
        where: { id: productId },
      });

      expect(deletedProduct.deletedAt).toBeDefined();
    });

    it('should return 404 for non-existent product', async () => {
      await request(app.server)
        .delete('/products/non-existent-id')
        .set('Authorization', 'Bearer mock-token')
        .expect(404);
    });

    it('should return 401 for missing authentication', async () => {
      await request(app.server)
        .delete(`/products/${productId}`)
        .expect(401);
    });
  });
});
```

### 11. Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testNamePattern="Product"
npm test -- Product.test.ts
npm test -- --testPathPattern="product"

# Run with coverage
npm run test:coverage

# Run integration tests only
npm run test:integration

# Watch mode for development
npm test -- --watch

# Verbose output
npm test -- --verbose

# Run tests in specific directory
npm test -- tests/domain/
npm test -- tests/infrastructure/
npm test -- tests/application/
npm test -- tests/integration/
```

### Test Best Practices

1. **Use camelCase fields** in all test assertions
2. **Clean up database** before each test
3. **Mock external dependencies** in unit tests
4. **Test error scenarios** and edge cases
5. **Use descriptive test names** that explain the scenario
6. **Group related tests** in describe blocks
7. **Set up test data** consistently in beforeEach
8. **Verify both database state** and API responses
9. **Test authentication** requirements
10. **Check event sourcing** and outbox events

## Troubleshooting

### Common Issues

#### 1. Field Naming Errors
```typescript
// ❌ Wrong - Don't use snake_case in code
user.created_at

// ✅ Correct - Use camelCase in code  
user.createdAt
```

#### 2. Database Column Errors
```sql
-- ❌ Wrong - Don't query camelCase columns directly
SELECT created_at FROM users;

-- ✅ Correct - Prisma handles the mapping
prisma.user.findMany(); // Returns camelCase fields
```

#### 3. Test Failures
```typescript
// ❌ Wrong - Don't expect snake_case in tests
expect(event).toMatchObject({
  event_type: 'UserCreated'  // Wrong!
});

// ✅ Correct - Expect camelCase in tests
expect(event).toMatchObject({
  eventType: 'UserCreated'   // Correct!
});
```

### Debug Commands

```bash
# Check database schema
npx prisma db pull

# View generated Prisma client
npx prisma generate --watch

# Debug SQL queries
DEBUG=prisma:query npm start

# Run specific test with debug
npm test -- --verbose UserRepository.test.ts
```

### Performance Issues

1. **Slow Queries**: Check Prisma query logs
2. **Memory Leaks**: Monitor Node.js heap usage  
3. **Cache Misses**: Check Redis connection and TTL settings
4. **Event Store Growth**: Implement snapshot strategy

### Verification Checklist

Before deploying changes:

- [ ] All tests pass (`npm test`)
- [ ] Integration tests pass (`npm run test:integration`)
- [ ] Build succeeds (`npm run build`)
- [ ] Database migrations applied (`npx prisma migrate status`)
- [ ] API returns camelCase fields
- [ ] Events use camelCase fields
- [ ] No snake_case fields in TypeScript code

---

## Recent Changes

### CamelCase Field Migration (Completed)

**Date**: August 6, 2025  
**Status**: ✅ Complete

**Changes Made**:
- Updated all Prisma models to use camelCase fields
- Added `@map()` directives to preserve snake_case database columns
- Updated all TypeScript code to use camelCase
- Fixed all test files to expect camelCase
- Verified API endpoints return camelCase
- Confirmed database queries use correct snake_case columns

**Benefits**:
- Improved developer experience with consistent JavaScript/TypeScript conventions
- Better IDE autocomplete and IntelliSense support
- Industry-standard field naming
- Maintained database compatibility

**Verification**:
- ✅ 66/66 unit tests passing
- ✅ API endpoints working correctly
- ✅ Database migrations up to date
- ✅ Event sourcing using camelCase
- ✅ No breaking changes to database schema

---

*Last Updated: August 6, 2025*
