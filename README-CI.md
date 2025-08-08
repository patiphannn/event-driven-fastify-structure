# GitLab CI/CD Pipeline Setup

## Quick Start

This project includes a comprehensive GitLab CI/CD pipeline with build, unit testing (80%+ coverage), and integration testing stages.

### Pipeline Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐    ┌──────────────┐
│    Build    │───▶│ Unit Tests  │───▶│ Integration Tests│───▶│ Docker Build │
│             │    │ (Coverage)  │    │ (PostgreSQL +   │    │ (Optional)   │
│ TypeScript  │    │  > 80%     │    │  Redis)          │    │              │
│ + Prisma    │    │             │    │                 │    │              │
└─────────────┘    └─────────────┘    └─────────────────┘    └──────────────┘
```

### Features

✅ **Build Stage**: TypeScript compilation + Prisma client generation  
✅ **Unit Tests**: 54 tests with 80%+ coverage requirement  
✅ **Integration Tests**: 8 end-to-end tests with real database  
✅ **Coverage Reports**: Integrated with GitLab UI  
✅ **Docker Build**: Containerized application testing  
✅ **Quality Gates**: Pipeline fails if coverage < 80%  

## Test Coverage

### Current Metrics
- **Lines**: 80.53% ✅
- **Statements**: 80.35% ✅  
- **Total Tests**: 62 (54 unit + 8 integration)

### Tested Components
- Domain entities and business logic
- Use cases and application services  
- Infrastructure repositories and data access
- Error handling and utilities

## Local Development

### Prerequisites
```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
```

### Running Tests

#### Unit Tests Only
```bash
npm run test:unit
npm run test:coverage  # With coverage report
```

#### Integration Tests (requires services)
```bash
# Option 1: Use testcontainers (automatic)
npm run test:integration

# Option 2: Manual service setup
docker run -d --name test-postgres -p 5432:5432 \
  -e POSTGRES_DB=test_db \
  -e POSTGRES_USER=test_user \
  -e POSTGRES_PASSWORD=test_password \
  postgres:15-alpine

docker run -d --name test-redis -p 6379:6379 redis:7-alpine

npm run test:integration
```

#### All Tests
```bash
npm run test:all
```

### Build and Development
```bash
npm run build      # Compile TypeScript
npm run dev        # Development server
npm start          # Production server
```

## GitLab CI Configuration

### Pipeline Triggers
- **Merge Requests**: Full pipeline execution
- **Main Branch**: Full pipeline on commits  
- **Tags**: Full pipeline for releases

### Environment Variables
The pipeline uses these predefined variables:
- `NODE_VERSION: "18"`
- `POSTGRES_*`: Test database configuration
- `REDIS_URL`: Cache service connection

### Artifacts and Reports
- **Coverage Reports**: Available in GitLab UI
- **Test Results**: JUnit XML integration
- **Build Artifacts**: Shared between stages

## Customization

### Adjusting Coverage Thresholds
Edit `jest.config.js`:
```javascript
coverageThreshold: {
  global: {
    lines: 80,        // Minimum line coverage
    statements: 80,   // Minimum statement coverage
  },
}
```

### Adding Test Exclusions
```javascript
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/tests/**',           // Exclude test files
  '!src/new-feature/**',     // Exclude new feature
],
```

### Pipeline Stages
Modify `.gitlab-ci.yml` to:
- Add new test stages
- Change Node.js version
- Add deployment stages
- Integrate with external services

## Troubleshooting

### Common Issues

#### Coverage Below 80%
```bash
# Check coverage details
npm run test:coverage

# View uncovered lines
open coverage/lcov-report/index.html
```

#### Integration Test Failures
```bash
# Run with debug logs
LOG_LEVEL=debug npm run test:integration

# Check service connectivity
docker ps
docker logs <container-name>
```

#### Pipeline Failures
1. Check GitLab CI logs in the pipeline view
2. Verify environment variables are set
3. Ensure services are healthy before tests
4. Check for dependency installation issues

### Debug Commands
```bash
# Test specific file
npm test -- src/tests/domain/User.test.ts

# Run with coverage for single file
npm test -- --coverage src/tests/domain/User.test.ts

# Integration test setup only
NODE_ENV=test npm run db:migrate
```

## Best Practices

### Writing Tests
- **Unit Tests**: Mock dependencies, test business logic
- **Integration Tests**: Use real services, test full workflows
- **Coverage**: Focus on critical business logic

### Pipeline Optimization
- **Cache**: Dependencies cached based on package-lock.json
- **Parallel Jobs**: Independent stages run in parallel when possible
- **Artifacts**: Share build outputs between stages

### Monitoring
- Check coverage trends in GitLab
- Monitor test execution times
- Review failed pipeline logs promptly

## Next Steps

### Planned Enhancements
1. **Security Scanning**: SAST/DAST integration
2. **Performance Testing**: Load testing with k6
3. **E2E Testing**: Browser automation
4. **Deployment**: Automated staging/production deploys
5. **Multi-Environment**: Testing across Node.js versions

### Contributing
1. Ensure tests pass locally before pushing
2. Maintain or improve test coverage
3. Add integration tests for new API endpoints
4. Update documentation for pipeline changes

For detailed information, see [GitLab CI Pipeline Documentation](docs/gitlab-ci-pipeline.md).
