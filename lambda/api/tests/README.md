# API Integration Tests

Comprehensive integration tests for the Office Lease Database API endpoints.

## Overview

This test suite validates all API endpoints with real database interactions, including:

- **Property and Suite APIs** - CRUD operations for properties and suites
- **Party API** - Tenant, landlord, and guarantor management
- **Lease and Lease Version APIs** - Lease creation and amendment tracking
- **Rent Schedule API** - Base rent period management
- **OpEx Pass-Through API** - Operating expense configurations
- **Option API** - Renewal, termination, and expansion options
- **Concession API** - TI allowances and free rent tracking
- **Critical Date API** - Key milestone dates
- **Document Link API** - External document references
- **Reporting APIs** - All 8 reporting endpoints
- **Batch Operations API** - Bulk create/update operations
- **Natural Language Query API** - Agent query processing
- **Authorization** - Role-based access control validation
- **Error Handling** - Validation and error response testing

## Prerequisites

### Database Setup

1. **PostgreSQL Database**: You need a test database with the schema migrations applied.

```bash
# Create test database
createdb lease_db_test

# Run migrations
cd schema
./run-migrations.sh
```

2. **Environment Variables**: Set the following environment variables:

```bash
export TEST_DB_HOST=localhost
export TEST_DB_PORT=5432
export TEST_DB_USER=postgres
export TEST_DB_PASSWORD=your_password
export TEST_DB_NAME=lease_db_test
```

Alternatively, if using AWS Secrets Manager:

```bash
export TEST_DB_SECRET_ARN=arn:aws:secretsmanager:region:account:secret:name
```

### Install Dependencies

```bash
cd lambda/api
npm install
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Specific Test Suite

```bash
npm test -- --testNamePattern="Property API"
```

### Watch Mode (for development)

```bash
npm run test:watch
```

## Test Structure

### Integration Test Flow

1. **Setup**: Create test data (property, suite, parties)
2. **Execute**: Test each API endpoint
3. **Validate**: Assert expected responses and database state
4. **Cleanup**: Remove test data

### Test Data

Tests create the following test data:
- 1 test property
- 1 test suite
- 2 test parties (tenant and landlord)
- 1 test lease with versions
- Associated rent schedules, options, concessions, etc.

All test data is cleaned up after tests complete.

## Test Coverage

The test suite covers:

### Functional Tests
- ✅ CRUD operations for all entities
- ✅ Query filtering and pagination
- ✅ Foreign key relationships
- ✅ Unique constraint enforcement
- ✅ Date range validations
- ✅ Enum value validations

### Authorization Tests
- ✅ Read-only role (analyst_ro) permissions
- ✅ Read-write role (lease_app_rw) permissions
- ✅ Forbidden access responses

### Error Handling Tests
- ✅ 404 Not Found errors
- ✅ 400 Validation errors
- ✅ 409 Conflict errors (duplicates)
- ✅ Error response format consistency

### Reporting Tests
- ✅ Expirations pipeline
- ✅ Rent roll current
- ✅ Options status
- ✅ Free rent status
- ✅ TI allowance summary
- ✅ Critical dates upcoming
- ✅ Amendment history
- ✅ OpEx summary

## Configuration

### Jest Configuration

See `jest.config.js` for test configuration:
- Test timeout: 30 seconds (for database operations)
- Test environment: Node.js
- Coverage reporting: Text, LCOV, HTML

### Test Setup

See `tests/setup.js` for environment configuration:
- Mock AWS Secrets Manager for local testing
- Configure database connection pool
- Set log levels

## Troubleshooting

### Connection Errors

If you see database connection errors:

1. Verify PostgreSQL is running:
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. Check credentials:
   ```bash
   psql -h localhost -U postgres -d lease_db_test
   ```

3. Verify migrations are applied:
   ```bash
   psql -h localhost -U postgres -d lease_db_test -c "\dt"
   ```

### Test Failures

If tests fail:

1. Check test database has clean schema:
   ```bash
   # Drop and recreate test database
   dropdb lease_db_test
   createdb lease_db_test
   cd schema && ./run-migrations.sh
   ```

2. Run tests with verbose output:
   ```bash
   npm test -- --verbose
   ```

3. Check for orphaned test data:
   ```bash
   psql -h localhost -U postgres -d lease_db_test -c "SELECT * FROM property WHERE name LIKE 'Test%';"
   ```

### Timeout Errors

If tests timeout:

1. Increase Jest timeout in `jest.config.js`
2. Check database performance
3. Reduce test data size

## CI/CD Integration

### GitHub Actions Example

```yaml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: lease_db_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd lambda/api
          npm install
      
      - name: Run migrations
        run: |
          cd schema
          ./run-migrations.sh
        env:
          TEST_DB_HOST: localhost
          TEST_DB_PORT: 5432
          TEST_DB_USER: postgres
          TEST_DB_PASSWORD: postgres
          TEST_DB_NAME: lease_db_test
      
      - name: Run tests
        run: |
          cd lambda/api
          npm test
        env:
          TEST_DB_HOST: localhost
          TEST_DB_PORT: 5432
          TEST_DB_USER: postgres
          TEST_DB_PASSWORD: postgres
          TEST_DB_NAME: lease_db_test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./lambda/api/coverage/lcov.info
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up test data in `afterAll` or `afterEach`
3. **Assertions**: Use specific assertions (toBe, toEqual) rather than truthy checks
4. **Error Cases**: Test both success and failure scenarios
5. **Real Data**: Use real database interactions, not mocks (for integration tests)

## Future Enhancements

- [ ] Add performance benchmarks
- [ ] Add load testing scenarios
- [ ] Add data validation tests
- [ ] Add concurrent operation tests
- [ ] Add transaction rollback tests
- [ ] Add view refresh tests
