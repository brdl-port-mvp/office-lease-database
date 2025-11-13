# Database Connection Layer

This module provides a robust database connection layer for the Office Lease Data Platform API, with support for connection pooling, transaction management, error handling, and structured logging.

## Features

- **Connection Pooling**: Efficient connection reuse with configurable pool settings
- **RDS Proxy Support**: Seamless integration with AWS RDS Proxy
- **Secrets Manager Integration**: Automatic credential retrieval with caching
- **Transaction Management**: Simple transaction APIs with automatic rollback
- **Error Handling**: PostgreSQL error mapping to HTTP status codes
- **Structured Logging**: JSON-formatted logs with correlation IDs
- **SSL Support**: Secure connections to RDS databases

## Usage

### Basic Query Execution

```javascript
const db = require('./db');

// Simple query
const properties = await db.queryRows(
  'SELECT * FROM property WHERE active = $1',
  [true]
);

// Single row query
const property = await db.queryOne(
  'SELECT * FROM property WHERE property_id = $1',
  [propertyId]
);

// Full result with metadata
const result = await db.query(
  'INSERT INTO property (name, address) VALUES ($1, $2) RETURNING *',
  ['Building A', '123 Main St']
);
console.log(`Inserted ${result.rowCount} rows`);
```

### Transaction Management

```javascript
const db = require('./db');

// Using withTransaction (recommended)
const result = await db.withTransaction(async (client) => {
  // All queries within this function are part of the transaction
  const lease = await client.query(
    'INSERT INTO lease (...) VALUES (...) RETURNING *',
    [...]
  );
  
  await client.query(
    'INSERT INTO lease_version (...) VALUES (...)',
    [...]
  );
  
  return lease.rows[0];
});

// Manual transaction management
const client = await db.beginTransaction();
try {
  await client.query('INSERT INTO ...');
  await client.query('UPDATE ...');
  await db.commitTransaction(client);
} catch (error) {
  await db.rollbackTransaction(client);
  throw error;
}
```

### Error Handling

```javascript
const db = require('./db');

try {
  await db.query('INSERT INTO property (...) VALUES (...)', [...]);
} catch (error) {
  // Map database error to HTTP response
  const errorResponse = db.createErrorResponse(error, requestId);
  
  return {
    statusCode: errorResponse.statusCode,
    body: JSON.stringify(errorResponse.body)
  };
}
```

### Logging

```javascript
const { logger } = require('./db');

// Log levels
logger.debug('Detailed debug information', { userId: 123 });
logger.info('Request processed successfully', { duration: 150 });
logger.warn('Slow query detected', { query: 'SELECT ...', duration: 5000 });
logger.error('Database connection failed', error);

// Specialized logging
logger.logRequest(event, correlationId);
logger.logResponse(200, correlationId, duration);
logger.logQuery(query, params, duration, rowCount);
```

## Environment Variables

### Required

- `DB_SECRET_ARN`: ARN of the Secrets Manager secret containing database credentials
- `DB_NAME`: Database name (default: `lease_db`)

### Optional

- `DB_PROXY_ENDPOINT`: RDS Proxy endpoint (if using RDS Proxy)
- `DB_POOL_MAX`: Maximum pool size (default: `10`)
- `DB_POOL_MIN`: Minimum pool size (default: `2`)
- `DB_IDLE_TIMEOUT`: Idle connection timeout in ms (default: `30000`)
- `DB_CONNECTION_TIMEOUT`: Connection timeout in ms (default: `10000`)
- `DB_SSL_ENABLED`: Enable SSL connections (default: `true`)
- `LOG_LEVEL`: Logging level - `DEBUG`, `INFO`, `WARN`, `ERROR` (default: `INFO`)
- `AWS_REGION`: AWS region for Secrets Manager (default: `us-east-1`)

## Secrets Manager Format

The database credentials secret should be stored in JSON format:

```json
{
  "username": "lease_app_rw",
  "password": "your-secure-password",
  "host": "your-rds-endpoint.rds.amazonaws.com",
  "port": 5432
}
```

## Error Codes

The error handler maps PostgreSQL errors to standardized error codes:

- `CONFLICT` (409): Unique constraint or exclusion violations
- `INVALID_REFERENCE` (400): Foreign key violations
- `VALIDATION_ERROR` (400): Check constraint or not-null violations
- `SERVICE_UNAVAILABLE` (503): Connection failures
- `TIMEOUT` (504): Query timeouts
- `INTERNAL_ERROR` (500): Unexpected errors

## Connection Pool Monitoring

```javascript
const db = require('./db');

// Get pool statistics
const stats = db.getPoolStats();
console.log(stats);
// {
//   initialized: true,
//   totalCount: 5,
//   idleCount: 3,
//   waitingCount: 0
// }
```

## Best Practices

1. **Use connection pooling**: Always use the provided `query` functions instead of creating new clients
2. **Use transactions for multi-step operations**: Wrap related operations in `withTransaction`
3. **Handle errors appropriately**: Use `createErrorResponse` for consistent error responses
4. **Log with correlation IDs**: Include correlation IDs for request tracing
5. **Set query timeouts**: Use the `timeout` option for long-running queries
6. **Close pool on shutdown**: Call `closePool()` during Lambda shutdown (if needed)

## Performance Considerations

- Credentials are cached for 5 minutes to reduce Secrets Manager API calls
- Connection pool reuses connections across Lambda invocations
- SSL connections are enabled by default for security
- Query logging is disabled by default (enable with `LOG_LEVEL=DEBUG`)

## Testing

The connection layer can be tested with environment variables:

```bash
export DB_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:lease-db-secret
export DB_NAME=lease_db_test
export LOG_LEVEL=DEBUG
export NODE_ENV=development
```

## Requirements Satisfied

This implementation satisfies **Requirement 23.3**:
- ✅ Database connection utility using node-postgres with RDS Proxy support
- ✅ Connection pooling configuration
- ✅ Query execution wrapper with error handling and logging
- ✅ Transaction management utilities (begin, commit, rollback)
- ✅ Credential retrieval from Secrets Manager
