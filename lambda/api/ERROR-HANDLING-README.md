# Error Handling and Response Formatting

This document describes the standardized error handling and response formatting utilities for the Office Lease Database API.

## Overview

The API uses consistent response formats across all endpoints to ensure predictable behavior for clients. All responses include:
- Success/error indicator
- Request correlation ID for tracing
- Timestamp
- Standardized error codes and messages

## Response Formatter

### Location
`lambda/api/response-formatter.js`

### Success Responses

#### Basic Success Response

```javascript
const { createSuccessResponse } = require('./response-formatter');

// Simple success response
return createSuccessResponse({ property_id: 1, property_name: 'Office Tower' });

// Response:
{
  "success": true,
  "data": {
    "property_id": 1,
    "property_name": "Office Tower"
  },
  "metadata": {
    "request_id": "1234567890-abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Success Response with Pagination

```javascript
return createSuccessResponse(
  properties,
  {
    pagination: {
      page: 1,
      page_size: 50,
      total_count: 150
    }
  }
);

// Response:
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total_count": 150,
    "total_pages": 3
  },
  "metadata": {
    "request_id": "1234567890-abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Success Response with Custom Status Code

```javascript
// 201 Created
return createSuccessResponse(
  { property_id: 1 },
  { statusCode: 201 }
);
```

### Error Responses

#### Database Error Response

```javascript
const { createStandardizedErrorResponse } = require('./response-formatter');

try {
  // Database operation
} catch (error) {
  return createStandardizedErrorResponse(error, requestId);
}

// Response for unique constraint violation:
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Resource already exists",
    "details": [{
      "type": "unique_violation",
      "constraint": "property_property_name_key",
      "detail": "Key (property_name)=(Office Tower) already exists."
    }],
    "request_id": "1234567890-abc123"
  },
  "metadata": {
    "request_id": "1234567890-abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Validation Error Response

```javascript
const { createValidationErrorResponse, validateRequiredFields } = require('./response-formatter');

const body = JSON.parse(event.body);
const errors = validateRequiredFields(body, ['property_name', 'address']);

if (errors.length > 0) {
  return createValidationErrorResponse(errors, requestId);
}

// Response:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "details": [
      {
        "field": "property_name",
        "message": "Field 'property_name' is required"
      }
    ],
    "request_id": "1234567890-abc123"
  },
  "metadata": {
    "request_id": "1234567890-abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Not Found Error Response

```javascript
const { createNotFoundResponse } = require('./response-formatter');

if (!property) {
  return createNotFoundResponse('Property', propertyId, requestId);
}

// Response:
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Property not found",
    "details": [{
      "resource": "Property",
      "id": "123",
      "message": "Property with ID 123 does not exist"
    }],
    "request_id": "1234567890-abc123"
  },
  "metadata": {
    "request_id": "1234567890-abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Authorization Error Responses

```javascript
const { createUnauthorizedResponse, createForbiddenResponse } = require('./response-formatter');

// 401 Unauthorized - missing or invalid credentials
return createUnauthorizedResponse('Invalid API credentials', requestId);

// 403 Forbidden - insufficient permissions
return createForbiddenResponse('Read-only role cannot perform this operation', requestId);
```

## Validation Utilities

### Validate Required Fields

```javascript
const { validateRequiredFields } = require('./response-formatter');

const body = JSON.parse(event.body);
const errors = validateRequiredFields(body, [
  'property_name',
  'address',
  'city',
  'state_province'
]);

if (errors.length > 0) {
  return createValidationErrorResponse(errors, requestId);
}
```

### Validate Field Types

```javascript
const { validateFieldTypes } = require('./response-formatter');

const errors = validateFieldTypes(body, {
  property_name: 'string',
  total_square_feet: 'number',
  active: 'boolean',
  suites: 'array'
});

if (errors.length > 0) {
  return createValidationErrorResponse(errors, requestId);
}
```

### Validate Enum Values

```javascript
const { validateEnumValues } = require('./response-formatter');

const errors = validateEnumValues(body, {
  property_type: ['OFFICE', 'RETAIL', 'INDUSTRIAL', 'MIXED_USE', 'OTHER'],
  lease_state: ['ACTIVE', 'EXPIRED', 'TERMINATED']
});

if (errors.length > 0) {
  return createValidationErrorResponse(errors, requestId);
}
```

### Combined Validation

```javascript
const {
  validateRequiredFields,
  validateFieldTypes,
  validateEnumValues,
  createValidationErrorResponse
} = require('./response-formatter');

const body = JSON.parse(event.body);

// Collect all validation errors
const errors = [
  ...validateRequiredFields(body, ['property_name', 'address']),
  ...validateFieldTypes(body, { total_square_feet: 'number' }),
  ...validateEnumValues(body, { property_type: ['OFFICE', 'RETAIL', 'INDUSTRIAL'] })
];

if (errors.length > 0) {
  return createValidationErrorResponse(errors, requestId);
}
```

## Error Handling Utilities

### Location
`lambda/api/db/errors.js`

### Database Error Mapping

The `mapDatabaseError` function automatically maps PostgreSQL error codes to HTTP status codes:

| PostgreSQL Error | HTTP Status | Error Code |
|-----------------|-------------|------------|
| Unique violation (23505) | 409 | CONFLICT |
| Foreign key violation (23503) | 400 | INVALID_REFERENCE |
| Check violation (23514) | 400 | VALIDATION_ERROR |
| Not null violation (23502) | 400 | VALIDATION_ERROR |
| Exclusion violation (23P01) | 409 | CONFLICT |
| Connection errors (08xxx) | 503 | SERVICE_UNAVAILABLE |
| Serialization failure (40001) | 409 | CONFLICT |
| Deadlock (40P01) | 409 | CONFLICT |
| Query timeout | 504 | TIMEOUT |

### Custom Database Errors

```javascript
const { DatabaseError } = require('./db/errors');

// Throw custom database error
throw new DatabaseError(
  'Invalid date range',
  'INVALID_DATE_RANGE',
  400,
  [{
    field: 'effective_daterange',
    message: 'Start date must be before end date'
  }]
);
```

### Check if Error is Retryable

```javascript
const { isRetryableError } = require('./db/errors');

try {
  // Database operation
} catch (error) {
  if (isRetryableError(error)) {
    // Retry logic
    logger.warn('Retryable error detected', { error: error.message });
  } else {
    throw error;
  }
}
```

## Logging Utilities

### Location
`lambda/api/db/logger.js`

### Basic Logging

```javascript
const logger = require('./db/logger');

// Debug logging (only in DEBUG mode)
logger.debug('Processing request', { propertyId: 123 });

// Info logging
logger.info('Property created successfully', { propertyId: 123 });

// Warning logging
logger.warn('Deprecated API version used', { version: 'v1' });

// Error logging
logger.error('Failed to create property', error);
```

### Request/Response Logging

```javascript
const logger = require('./db/logger');

exports.handler = async (event) => {
  const requestId = logger.generateCorrelationId();
  const startTime = Date.now();

  // Log incoming request
  logger.logRequest(event, requestId);

  try {
    // Process request
    const result = await processRequest(event);

    // Log successful response
    logger.logResponse(200, requestId, Date.now() - startTime);

    return createSuccessResponse(result, { metadata: { request_id: requestId } });
  } catch (error) {
    logger.error('Request failed', error);
    logger.logResponse(500, requestId, Date.now() - startTime);

    return createStandardizedErrorResponse(error, requestId);
  }
};
```

### Database Query Logging

```javascript
const logger = require('./db/logger');

const startTime = Date.now();
const result = await pool.query(query, params);
const duration = Date.now() - startTime;

logger.logQuery(query, params, duration, result.rowCount);
```

### Transaction Logging

```javascript
const logger = require('./db/logger');

logger.logTransaction('begin', requestId);
try {
  // Transaction operations
  await pool.query('COMMIT');
  logger.logTransaction('commit', requestId);
} catch (error) {
  await pool.query('ROLLBACK');
  logger.logTransaction('rollback', requestId);
  throw error;
}
```

### Sensitive Data Redaction

The logger automatically redacts sensitive fields:

```javascript
logger.info('User authenticated', {
  username: 'john@example.com',
  password: 'secret123',  // Will be redacted
  token: 'abc123'         // Will be redacted
});

// Logged as:
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "message": "User authenticated",
  "username": "john@example.com",
  "password": "[REDACTED]",
  "token": "[REDACTED]"
}
```

## Complete Lambda Function Example

```javascript
const { getConnection } = require('./db/connection');
const logger = require('./db/logger');
const {
  createSuccessResponse,
  createStandardizedErrorResponse,
  createValidationErrorResponse,
  createNotFoundResponse,
  validateRequiredFields,
  validateFieldTypes
} = require('./response-formatter');

exports.handler = async (event) => {
  const requestId = logger.generateCorrelationId();
  const startTime = Date.now();

  logger.logRequest(event, requestId);

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');

    // Validate required fields
    const requiredErrors = validateRequiredFields(body, ['property_name', 'address']);
    if (requiredErrors.length > 0) {
      return createValidationErrorResponse(requiredErrors, requestId);
    }

    // Validate field types
    const typeErrors = validateFieldTypes(body, {
      property_name: 'string',
      total_square_feet: 'number'
    });
    if (typeErrors.length > 0) {
      return createValidationErrorResponse(typeErrors, requestId);
    }

    // Database operation
    const pool = await getConnection();
    const result = await pool.query(
      'INSERT INTO property (property_name, address) VALUES ($1, $2) RETURNING *',
      [body.property_name, body.address]
    );

    logger.info('Property created', { propertyId: result.rows[0].property_id });
    logger.logResponse(201, requestId, Date.now() - startTime);

    return createSuccessResponse(
      result.rows[0],
      {
        statusCode: 201,
        metadata: { request_id: requestId }
      }
    );

  } catch (error) {
    logger.error('Failed to create property', error);
    logger.logResponse(error.statusCode || 500, requestId, Date.now() - startTime);

    return createStandardizedErrorResponse(error, requestId);
  }
};
```

## Environment Variables

### LOG_LEVEL

Controls the logging verbosity:
- `DEBUG`: All logs (debug, info, warn, error)
- `INFO`: Info, warn, and error logs (default)
- `WARN`: Warn and error logs only
- `ERROR`: Error logs only

```bash
export LOG_LEVEL=DEBUG
```

### NODE_ENV

Controls error detail exposure:
- `production`: Hides stack traces in error responses
- Other values: Includes stack traces for debugging

```bash
export NODE_ENV=production
```

## Best Practices

1. **Always use correlation IDs**: Generate a correlation ID at the start of each request and pass it through all logging and error responses.

2. **Log at appropriate levels**:
   - DEBUG: Detailed information for debugging
   - INFO: General informational messages
   - WARN: Warning messages for potentially harmful situations
   - ERROR: Error messages for failures

3. **Validate early**: Perform all input validation before database operations to avoid unnecessary database calls.

4. **Use structured logging**: Always include relevant context in log messages (IDs, operation types, etc.).

5. **Redact sensitive data**: Never log passwords, tokens, or other sensitive information.

6. **Handle errors consistently**: Always use the standardized error response formatter to ensure consistent error responses.

7. **Include request IDs in responses**: Always include the correlation ID in response headers and body for tracing.

8. **Log database queries in DEBUG mode**: Use `logQuery` to track slow queries and optimize performance.

9. **Use appropriate HTTP status codes**: Follow REST conventions for status codes (200, 201, 400, 404, 409, 500, etc.).

10. **Provide actionable error messages**: Error messages should help clients understand what went wrong and how to fix it.

## Error Code Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Input validation failed |
| INVALID_REFERENCE | 400 | Referenced resource does not exist |
| UNAUTHORIZED | 401 | Authentication required |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource conflict (duplicate, overlap, etc.) |
| INTERNAL_ERROR | 500 | Server error |
| SERVICE_UNAVAILABLE | 503 | Database connection failed |
| TIMEOUT | 504 | Query execution timeout |

