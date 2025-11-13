# Testing Guide

## Overview

This directory contains comprehensive integration and unit tests for the Office Lease Database API.

## Test Files

### `unit.test.js`
Unit tests for validation, formatting, and utility functions. These tests do not require a database connection and can run independently.

**Coverage:**
- Response formatter validation functions
- Property data validation
- Event helper functions
- Error response formatting

### `integration.test.js`
Full integration tests that interact with a real PostgreSQL database. These tests validate all API endpoints end-to-end.

**Coverage:**
- All CRUD operations for properties, suites, parties, leases
- Rent schedules, OpEx, options, concessions
- Critical dates and document links
- All 8 reporting endpoints
- Batch operations
- Natural language query processing
- Authorization and role-based access control
- Error handling and validation

### `setup.js`
Test environment configuration and AWS SDK mocking for local development.

## Running Tests

### Prerequisites

1. **Node.js and npm** installed
2. **PostgreSQL** running locally or accessible remotely
3. **Database schema** applied via migrations

### Setup Steps

```bash
# 1. Navigate to the API directory
cd lambda/api

# 2. Install dependencies
npm install

# 3. Set environment variables
export TEST_DB_HOST=localhost
export TEST_DB_PORT=5432
export TEST_DB_USER=postgres
export TEST_DB_PASSWORD=your_password
export TEST_DB_NAME=lease_db_test

# 4. Create and setup test database
createdb lease_db_test
cd ../../schema
./run-migrations.sh
cd ../lambda/api

# 5. Run tests
npm test
```

### Test Commands

```bash
# Run all tests
npm test

# Run only unit tests (no database required)
npm test -- unit.test.js

# Run only integration tests
npm test -- integration.test.js

# Run with coverage report
npm run test:coverage

# Run in watch mode (for development)
npm run test:watch

# Run specific test suite
npm test -- --testNamePattern="Property API"
```

## Test Results Interpretation

### Successful Test Run

```
PASS  tests/unit.test.js
  Response Formatter Unit Tests
    ✓ validateRequiredFields returns empty array for valid data (5ms)
    ✓ validateFieldTypes returns empty array for correct types (3ms)
    ...

PASS  tests/integration.test.js
  Office Lease Database API Integration Tests
    Property API
      ✓ POST /properties - Create property (150ms)
      ✓ GET /properties/{id} - Get property by ID (45ms)
      ...

Test Suites: 2 passed, 2 total
Tests:       45 passed, 45 total
Snapshots:   0 total
Time:        15.234s
```

### Failed Test Example

```
FAIL  tests/integration.test.js
  Office Lease Database API Integration Tests
    Property API
      ✕ POST /properties - Create property (200ms)

  ● Office Lease Database API Integration Tests › Property API › POST /properties - Create property

    expect(received).toBe(expected) // Object.is equality

    Expected: 201
    Received: 400

      at Object.<anonymous> (tests/integration.test.js:85:35)
```

## Test Data Management

### Test Data Lifecycle

1. **Setup** (`beforeAll`): Initialize database connection
2. **Test Execution**: Create test data as needed
3. **Cleanup** (`afterAll`): Delete all test data and close connections

### Test Data Isolation

Each test creates its own data and the suite cleans up after completion. Test data uses predictable naming:
- Properties: "Test Building A", "Batch Property 1", etc.
- Parties: "Test Tenant Corp", "Test Landlord LLC"
- Leases: "TEST-LEASE-001"

### Manual Cleanup

If tests fail and leave orphaned data:

```sql
-- Check for test data
SELECT * FROM property WHERE name LIKE 'Test%' OR name LIKE 'Batch%';
SELECT * FROM party WHERE legal_name LIKE 'Test%';
SELECT * FROM lease WHERE master_lease_num LIKE 'TEST-%';

-- Clean up test data
DELETE FROM lease WHERE master_lease_num LIKE 'TEST-%';
DELETE FROM party WHERE legal_name LIKE 'Test%';
DELETE FROM property WHERE name LIKE 'Test%' OR name LIKE 'Batch%';
```

## Coverage Reports

After running `npm run test:coverage`, view the coverage report:

```bash
# Open HTML coverage report
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

### Coverage Targets

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

## Troubleshooting

### Database Connection Issues

**Error**: `Connection refused` or `ECONNREFUSED`

**Solution**:
1. Verify PostgreSQL is running: `pg_isready`
2. Check connection parameters match your setup
3. Verify firewall/network settings

### Schema Issues

**Error**: `relation "property" does not exist`

**Solution**:
1. Run migrations: `cd schema && ./run-migrations.sh`
2. Verify migrations completed: `psql -d lease_db_test -c "\dt"`

### Timeout Errors

**Error**: `Timeout - Async callback was not invoked within the 30000 ms timeout`

**Solution**:
1. Increase timeout in `jest.config.js`
2. Check database performance
3. Verify network latency

### Permission Errors

**Error**: `permission denied for table property`

**Solution**:
1. Grant permissions: `GRANT ALL ON ALL TABLES IN SCHEMA public TO your_user;`
2. Verify user has necessary privileges

### AWS Secrets Manager Errors

**Error**: `Failed to retrieve credentials from Secrets Manager`

**Solution**:
For local testing, the setup file mocks Secrets Manager. Ensure:
1. `TEST_DB_SECRET_ARN` is NOT set (to use mock)
2. Or set local database credentials via environment variables

## CI/CD Integration

### Environment Variables for CI

```bash
TEST_DB_HOST=postgres
TEST_DB_PORT=5432
TEST_DB_USER=postgres
TEST_DB_PASSWORD=postgres
TEST_DB_NAME=lease_db_test
NODE_ENV=test
```

### GitHub Actions Workflow

See `tests/README.md` for a complete GitHub Actions workflow example.

## Best Practices

1. **Run unit tests first**: They're faster and don't require database setup
2. **Use watch mode during development**: `npm run test:watch`
3. **Check coverage regularly**: Aim for >80% coverage
4. **Clean up test data**: Always clean up in `afterAll` hooks
5. **Test error cases**: Don't just test happy paths
6. **Use descriptive test names**: Make failures easy to understand
7. **Keep tests independent**: Each test should work in isolation

## Adding New Tests

### Adding a Unit Test

```javascript
describe('New Feature Unit Tests', () => {
  test('Should validate new field correctly', () => {
    const result = validateNewField('valid-value');
    expect(result).toBe(true);
  });
});
```

### Adding an Integration Test

```javascript
describe('New API Endpoint', () => {
  test('POST /new-endpoint - Create resource', async () => {
    const event = createEvent('POST', '/new-endpoint', {
      field: 'value'
    });
    
    const response = await newHandler(event);
    const parsed = parseResponse(response);
    
    expect(parsed.statusCode).toBe(201);
    expect(parsed.body.field).toBe('value');
  });
});
```

## Performance Benchmarks

Expected test execution times:

- **Unit tests**: < 1 second
- **Integration tests**: 10-20 seconds
- **Full suite with coverage**: 20-30 seconds

If tests are significantly slower, investigate:
- Database query performance
- Network latency
- Connection pool configuration

## Support

For issues or questions:
1. Check this guide first
2. Review test output and error messages
3. Check database logs
4. Verify environment configuration
5. Consult the main API documentation
