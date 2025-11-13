# Authorization Integration Guide

## Overview

This guide explains how to integrate role-based access control (RBAC) into Lambda functions for the Office Lease API. All Lambda functions must implement authorization checks to enforce the three-role security model.

## Three-Role Security Model

### 1. lease_app_rw (Service Role)
- **Access**: Full CRUD operations on all endpoints
- **Use Cases**: Application services, batch jobs, automated processes
- **Allowed Methods**: GET, POST, PUT, DELETE, PATCH, OPTIONS

### 2. analyst_ro (User Role)
- **Access**: Read-only operations
- **Use Cases**: Analysts, BI tools, reporting dashboards
- **Allowed Methods**: GET, OPTIONS
- **Denied Methods**: POST, PUT, DELETE, PATCH

### 3. admin_dba (Admin Role)
- **Access**: Full administrative access
- **Use Cases**: Database administrators, DevOps, schema migrations
- **Allowed Methods**: All methods including administrative operations

## Integration Steps

### Step 1: Import Authorization Module

At the top of your Lambda function, the `db` module already includes authorization utilities:

```javascript
const db = require('./db');
```

The authorization utilities are available at:
```javascript
db.authorization.authorizeRequest(event)
db.authorization.extractRole(event)
db.authorization.extractPrincipal(event)
db.authorization.checkPermission(role, httpMethod)
db.authorization.isReadOnly(role)
db.authorization.hasWriteAccess(role)
db.authorization.isAdmin(role)
db.authorization.createForbiddenResponse(reason, correlationId)
db.authorization.ROLES
```

### Step 2: Add Authorization Check to Handler

Add the authorization check immediately after logging the request:

```javascript
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // ✅ ADD THIS: Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    // Continue with normal request handling
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    // ... rest of handler logic
```

The `authorizeRequest()` function will:
- Extract the role from the request context (injected by Lambda authorizer)
- Extract the IAM principal ARN
- Check if the role has permission for the HTTP method
- Log the authorization decision
- Throw a FORBIDDEN error if access is denied
- Return authorization details if access is granted

### Step 3: Handle Authorization Errors

Update the catch block to handle authorization errors:

```javascript
  } catch (error) {
    db.logger.error('API error', error);
    
    // ✅ ADD THIS: Handle authorization errors specially
    if (error.code === 'FORBIDDEN') {
      const duration = Date.now() - startTime;
      db.logger.logResponse(403, correlationId, duration);
      return db.authorization.createForbiddenResponse(
        error.details?.reason || 'Access denied', 
        correlationId
      );
    }
    
    // Handle other errors normally
    const errorResponse = db.createErrorResponse(error, correlationId);
    
    const duration = Date.now() - startTime;
    db.logger.logResponse(errorResponse.statusCode, correlationId, duration);
    
    return createResponse(errorResponse.statusCode, errorResponse.body, correlationId);
  }
};
```

## Complete Example

Here's a complete example of a Lambda function with authorization:

```javascript
/**
 * Example API Lambda Function with Authorization
 */

const db = require('./db');

exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const resourceId = pathParameters?.id;
    
    let result;
    
    switch (httpMethod) {
      case 'GET':
        if (resourceId) {
          result = await getResource(resourceId);
        } else {
          result = await listResources(queryStringParameters || {});
        }
        break;
        
      case 'POST':
        result = await createResource(JSON.parse(body || '{}'));
        break;
        
      case 'PUT':
        if (!resourceId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Resource ID is required' 
            } 
          }, correlationId);
        }
        result = await updateResource(resourceId, JSON.parse(body || '{}'));
        break;
        
      case 'DELETE':
        if (!resourceId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Resource ID is required' 
            } 
          }, correlationId);
        }
        result = await deleteResource(resourceId);
        break;
        
      default:
        return createResponse(405, { 
          error: { 
            code: 'METHOD_NOT_ALLOWED', 
            message: `Method ${httpMethod} not allowed` 
          } 
        }, correlationId);
    }
    
    const duration = Date.now() - startTime;
    db.logger.logResponse(result.statusCode, correlationId, duration);
    
    return createResponse(result.statusCode, result.body, correlationId);
    
  } catch (error) {
    db.logger.error('API error', error);
    
    // Handle authorization errors specially
    if (error.code === 'FORBIDDEN') {
      const duration = Date.now() - startTime;
      db.logger.logResponse(403, correlationId, duration);
      return db.authorization.createForbiddenResponse(
        error.details?.reason || 'Access denied', 
        correlationId
      );
    }
    
    const errorResponse = db.createErrorResponse(error, correlationId);
    
    const duration = Date.now() - startTime;
    db.logger.logResponse(errorResponse.statusCode, correlationId, duration);
    
    return createResponse(errorResponse.statusCode, errorResponse.body, correlationId);
  }
};

function createResponse(statusCode, body, correlationId = null) {
  const response = {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify(body)
  };
  
  if (correlationId) {
    response.headers['X-Correlation-ID'] = correlationId;
  }
  
  return response;
}
```

## Advanced Usage

### Check Role Programmatically

If you need to implement custom authorization logic based on role:

```javascript
const role = db.authorization.extractRole(event);

if (db.authorization.isReadOnly(role)) {
  // Limit query results for read-only users
  query += ' LIMIT 100';
}

if (db.authorization.isAdmin(role)) {
  // Include administrative fields
  includeAdminFields = true;
}

if (db.authorization.hasWriteAccess(role)) {
  // Allow bulk operations
  allowBulkOperations = true;
}
```

### Manual Permission Check

If you need to check permissions without throwing an error:

```javascript
const role = db.authorization.extractRole(event);
const permission = db.authorization.checkPermission(role, 'POST');

if (!permission.allowed) {
  console.log('Permission denied:', permission.reason);
  return createResponse(403, {
    error: {
      code: 'FORBIDDEN',
      message: permission.reason
    }
  }, correlationId);
}
```

### Access Principal Information

Get the IAM principal ARN for audit logging:

```javascript
const principal = db.authorization.extractPrincipal(event);
console.log('Request from:', principal);

// Log to database for audit trail
await db.query(
  'INSERT INTO audit_log (principal, action, resource) VALUES ($1, $2, $3)',
  [principal, 'DELETE', resourceId]
);
```

## Authorization Flow

```
1. API Gateway receives request with IAM signature
2. API Gateway invokes Lambda authorizer
3. Lambda authorizer validates IAM principal and generates policy
4. API Gateway evaluates policy and injects role into request context
5. API Gateway invokes target Lambda function
6. Lambda function calls db.authorization.authorizeRequest(event)
7. Authorization module extracts role from request context
8. Authorization module checks if role has permission for HTTP method
9. If denied: throws FORBIDDEN error → Lambda returns 403
10. If allowed: continues with request processing
11. Lambda logs authorization decision with principal ARN
```

## Error Responses

### 403 Forbidden Response Format

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this operation",
    "details": [
      {
        "reason": "analyst_ro does not have write access"
      }
    ]
  }
}
```

## Testing Authorization

### Test with Different Roles

```bash
# Test with lease_app_rw role (should succeed for all methods)
aws lambda invoke \
  --function-name properties-api \
  --payload '{"httpMethod":"POST","body":"{}","requestContext":{"authorizer":{"role":"lease_app_rw"}}}' \
  response.json

# Test with analyst_ro role (should fail for POST)
aws lambda invoke \
  --function-name properties-api \
  --payload '{"httpMethod":"POST","body":"{}","requestContext":{"authorizer":{"role":"analyst_ro"}}}' \
  response.json

# Test with analyst_ro role (should succeed for GET)
aws lambda invoke \
  --function-name properties-api \
  --payload '{"httpMethod":"GET","requestContext":{"authorizer":{"role":"analyst_ro"}}}' \
  response.json
```

### Unit Test Example

```javascript
const { handler } = require('./properties');

describe('Authorization', () => {
  it('should allow lease_app_rw to POST', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Test Property' }),
      requestContext: {
        authorizer: {
          role: 'lease_app_rw',
          principalArn: 'arn:aws:iam::123456789012:role/lease_app_rw'
        }
      }
    };
    
    const response = await handler(event);
    expect(response.statusCode).not.toBe(403);
  });
  
  it('should deny analyst_ro from POST', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Test Property' }),
      requestContext: {
        authorizer: {
          role: 'analyst_ro',
          principalArn: 'arn:aws:iam::123456789012:role/analyst_ro'
        }
      }
    };
    
    const response = await handler(event);
    expect(response.statusCode).toBe(403);
  });
  
  it('should allow analyst_ro to GET', async () => {
    const event = {
      httpMethod: 'GET',
      requestContext: {
        authorizer: {
          role: 'analyst_ro',
          principalArn: 'arn:aws:iam::123456789012:role/analyst_ro'
        }
      }
    };
    
    const response = await handler(event);
    expect(response.statusCode).not.toBe(403);
  });
});
```

## Checklist for Integration

Use this checklist when adding authorization to a Lambda function:

- [ ] Import `db` module (already done if using database)
- [ ] Add `db.authorization.authorizeRequest(event)` after request logging
- [ ] Add authorization error handling in catch block
- [ ] Test with all three roles (lease_app_rw, analyst_ro, admin_dba)
- [ ] Test with all HTTP methods (GET, POST, PUT, DELETE)
- [ ] Verify 403 responses for unauthorized access
- [ ] Verify authorization decisions are logged
- [ ] Verify principal ARN is logged for audit trail

## Lambda Functions Requiring Authorization

All Lambda functions must implement authorization:

- ✅ properties.js
- ✅ leases.js
- ✅ reports.js
- ⏳ suites.js
- ⏳ parties.js
- ⏳ rent-schedules.js
- ⏳ opex-pass-throughs.js
- ⏳ options.js
- ⏳ concessions.js
- ⏳ critical-dates.js
- ⏳ doc-links.js
- ⏳ batch.js
- ⏳ nlq.js

## Monitoring and Logging

Authorization decisions are automatically logged with the following information:

- **Authorization Check**: Role, principal, HTTP method, path
- **Authorization Granted**: Role, principal, HTTP method, reason
- **Authorization Denied**: Role, principal, HTTP method, reason

Monitor these logs in CloudWatch to:
- Track access patterns by role
- Identify unauthorized access attempts
- Audit who accessed what resources
- Debug authorization issues

## Security Best Practices

1. **Always call authorizeRequest()**: Never skip authorization checks
2. **Handle FORBIDDEN errors**: Always check for error.code === 'FORBIDDEN'
3. **Log authorization decisions**: Use the built-in logging (automatic)
4. **Don't expose sensitive info**: Error messages should not reveal system internals
5. **Validate role extraction**: The authorizer ensures valid roles, but defensive coding is good
6. **Use principle of least privilege**: Only grant minimum required permissions
7. **Audit regularly**: Review CloudWatch logs for suspicious activity

## Troubleshooting

### "No role found in request context"

- Ensure API Gateway is configured with Lambda authorizer
- Verify authorizer is attached to the API route
- Check that authorizer is injecting role into context

### "analyst_ro does not have write access"

- This is expected behavior for POST/PUT/DELETE with analyst_ro role
- User needs to use lease_app_rw or admin_dba role for write operations

### Authorization not working in local testing

- Mock the request context in your test events:
```javascript
{
  "requestContext": {
    "authorizer": {
      "role": "lease_app_rw",
      "principalArn": "arn:aws:iam::123456789012:role/lease_app_rw"
    }
  }
}
```

## Support

For questions or issues with authorization integration:
1. Check CloudWatch logs for authorization decisions
2. Review this guide and the authorizer README
3. Test with different roles using the test examples above
4. Verify API Gateway authorizer configuration
