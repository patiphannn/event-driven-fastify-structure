# User Service - Clean Architecture Microservice

A Node.js microservice built with Clean Architecture principles for user creation, featuring the Outbox Pattern for transactional atomicity, distributed tracing with OpenTelemetry, and comprehensive observability.

## 🏗️ Architecture

This service follows **Clean Architecture** principles with the following layers:

```
src/
├── domain/                 # Domain Layer (Business Logic)
│   ├── entities/          # Domain entities (User, OutboxEvent)
│   ├── repositories/      # Repository interfaces
│   └── events/           # Domain events
├── application/           # Application Layer (Use Cases)
│   ├── usecases/         # Business use cases
│   └── ports/            # Interface definitions
├── infrastructure/       # Infrastructure Layer (External Systems)
│   ├── database/         # Database implementations
│   ├── repositories/     # Repository implementations
│   ├── cache/           # Redis cache client
│   ├── tracing/         # OpenTelemetry setup
│   └── outbox/          # Outbox pattern processor
├── presentation/         # Presentation Layer (HTTP API)
│   ├── controllers/     # HTTP controllers
│   └── routes/          # Route definitions
└── shared/              # Shared utilities
    ├── types/           # TypeScript type definitions
    ├── errors/          # Custom error classes
    └── utils/           # Utility functions
```

## 🚀 Features

- **Clean Architecture**: Separation of concerns with dependency inversion
- **Outbox Pattern**: Transactional atomicity between database operations and event publishing
- **Distributed Tracing**: OpenTelemetry integration with trace/span correlation
- **Redis Caching**: Intelligent caching for improved performance
- **Pagination**: Efficient pagination for list endpoints
- **API Documentation**: Swagger/OpenAPI 3.0 documentation with interactive UI
- **Type Safety**: Full TypeScript implementation
- **Database**: PostgreSQL with Prisma ORM
- **Logging**: Structured logging with Pino
- **Health Checks**: Built-in health endpoint

## 🛠️ Technologies

- **Framework**: Fastify
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis with intelligent caching strategies
- **Documentation**: Swagger/OpenAPI 3.0 with Fastify plugins
- **Logging**: Pino
- **Tracing**: OpenTelemetry
- **Language**: TypeScript
- **Environment**: dotenv

## 📦 Installation

1. **Clone and navigate to the project:**
   ```bash
   cd mcsv2
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://username:password@localhost:5432/userservice?schema=public"
   REDIS_URL="redis://localhost:6379"
   LOG_LEVEL=info
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
   OTEL_SERVICE_NAME=user-service
   NODE_ENV=development
   ```

4. **Set up the database:**
   ```bash
   # Generate Prisma client
   npm run db:generate
   
   # Run database migrations
   npm run db:migrate
   ```

## 🏃‍♂️ Running the Service

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
# Build the project
npm run build

# Start the server
npm start
```

## 🔄 Database Management

```bash
# Generate Prisma client after schema changes
npm run db:generate

# Create and apply new migration
npm run db:migrate

# Reset database (development only)
npm run db:reset

# Open Prisma Studio
npm run db:studio
```

## 📡 API Endpoints

### Create User
**POST** `/users`

Creates a new user asynchronously using the Outbox Pattern.

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe"
}
```

**Response (202 Accepted):**
```json
{
  "id": "cm1a2b3c4d5e6f7g8h9i0j1k",
  "message": "User creation initiated successfully"
}
```

**Error Responses:**
- `400 Bad Request`: Validation errors
- `409 Conflict`: User already exists
- `500 Internal Server Error`: Unexpected errors

### Health Check
**GET** `/health`

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 📖 API Documentation

The service provides comprehensive API documentation using **Swagger/OpenAPI 3.0**.

### Interactive Documentation
- **Swagger UI**: Visit [http://localhost:3000/docs](http://localhost:3000/docs) when the server is running
- **OpenAPI JSON**: Available at [http://localhost:3000/docs/json](http://localhost:3000/docs/json) for integration with tools

### Features
- **Interactive Interface**: Test endpoints directly from the browser
- **Request/Response Examples**: See sample payloads and responses
- **Schema Validation**: View detailed parameter and response schemas
- **Tags Organization**: Endpoints grouped by functionality (Users, Health)
- **Error Documentation**: Complete error response documentation

### Available Endpoints

#### Users
- **POST /users**: Create a new user (asynchronous with 202 Accepted)
- **GET /users**: List users with pagination and Redis caching

#### Health
- **GET /health**: Service health check

Each endpoint includes:
- Detailed descriptions and summaries
- Request/response schema definitions
- Parameter validation rules
- Error response documentation
- Example values and formats

## 🎯 Outbox Pattern Implementation

The service implements the Outbox Pattern to ensure transactional atomicity:

1. **User Creation**: Within a database transaction:
   - Save user to `users` table
   - Save `UserCreated` event to `outbox_events` table
   - Include trace metadata (trace ID, span ID) for correlation

2. **Event Processing**: Background processor:
   - Polls `outbox_events` table for unprocessed events
   - Publishes events to external systems (simulated)
   - Marks events as processed
   - Maintains trace correlation

## 📊 Observability

### Distributed Tracing
- **OpenTelemetry** integration with OTLP HTTP exporter
- **Trace correlation** between HTTP requests and async event processing
- **Custom spans** for business operations
- **Trace metadata** stored in outbox events for full traceability

### Logging
- **Structured logging** with Pino
- **Correlation IDs** for request tracking
- **Error tracking** with stack traces
- **Performance metrics** for database operations

### Metrics & Monitoring
- HTTP request/response metrics
- Database query performance
- Cache hit/miss rates (when Redis is used)
- Outbox processing metrics

## 🧪 Testing the Service

### Using Swagger UI (Recommended)

The easiest way to test the API is through the interactive Swagger documentation:

1. **Start the service** (if not already running):
   ```bash
   npm run dev
   ```

2. **Open Swagger UI** in your browser:
   ```
   http://localhost:3000/docs
   ```

3. **Test endpoints interactively**:
   - Click on any endpoint to expand it
   - Click "Try it out" to enable testing
   - Fill in the request parameters/body
   - Click "Execute" to send the request
   - View the response in real-time

### Using curl

1. **Create a user:**
```bash
curl -X POST http://localhost:3000/users \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "john.doe@example.com",
    "name": "John Doe"
  }'
```

2. **List users with pagination:**
```bash
# Get first page with default limit (10)
curl "http://localhost:3000/users"

# Get specific page and limit
curl "http://localhost:3000/users?page=2&limit=5"
```

3. **Check health:**
```bash
curl http://localhost:3000/health
```

4. **Try creating duplicate user (should return 409):**
```bash
curl -X POST http://localhost:3000/users \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "john.doe@example.com",
    "name": "John Doe"
  }'
```

## 🐳 Docker Support

The service is containerization-ready. Here's a sample `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `LOG_LEVEL` | Logging level | `info` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry endpoint | `http://localhost:4318/v1/traces` |
| `OTEL_SERVICE_NAME` | Service name for tracing | `user-service` |
| `NODE_ENV` | Environment mode | `development` |

## 🏭 Production Considerations

1. **Database Connection Pooling**: Configure Prisma connection limits
2. **Redis Clustering**: Use Redis Cluster for high availability
3. **Load Balancing**: Deploy behind a load balancer
4. **Monitoring**: Set up Prometheus/Grafana for metrics
5. **Log Aggregation**: Use ELK stack or similar
6. **Security**: Implement rate limiting, input validation, and authentication
7. **Outbox Processing**: Scale outbox processors based on load

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

For questions and support, please create an issue in the repository.
