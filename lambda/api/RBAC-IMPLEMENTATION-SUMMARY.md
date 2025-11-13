# Role-Based Access Control (RBAC) Implementation Summary

## Overview
This document summarizes the implementation of role-based access control across all Lambda API functions for the Office Lease Data Platform.

## Implementation Date
November 11, 2025

## Task Reference
Task 16.2: Implement role-based access control in Lambda functions

## Requirements Addressed
- 22.2: Authorize requests based on role-based access control
- 22.3: Support read-only access for analyst roles
- 22.4: Support read-write access for application service roles
- 22.5: Log all API access attempts with user identity and timestamp

## Authorization Module (`lambda/api/db/authorization.js`)

### Roles Defined
1. **lease_app_rw** - Full CRUD access (read-write)
2. **analyst_ro** - Read-only access (GET, HEAD, OPTIONS)
3. **admin_dba** - Full administrative access

### Key Functions
- `extractRole(event)` - Extracts role from request context
- `extractPrincipal(event)` - Extracts IAM principal ARN
- `checkPermission(role, httpMethod)` - Validates role permissions
- `authorizeRequest(event)` - Main authorization function (throws error if denied)
- `isReadOnly(role)` - Checks if role is read-only
- `hasWriteAccess(role)` - Checks if role has write access
- `isAdmin(role)` - Checks if role is admin
- `createForbiddenResponse(reason, correlationId)` - Creates 403 response

### Authorization Logic
- **lease_app_rw**: Allowed all HTTP methods (GET, POST, PUT, DELETE, PATCH)
- **analyst_ro**: Allowed only read methods (GET, HEAD, OPTIONS), blocked write methods (POST, PUT, DELETE, PATCH)
- **admin_dba**: Allowed all HTTP methods (full access)
- **Unknown/No role**: Denied all access

## Lambda Functions Updated

### Functions with Authorization Implemented
All Lambda functions now include authorization checks:

1. ✅ **properties.js** - Property CRUD operations
2. ✅ **suites.js** - Suite CRUD operations
3. ✅ **parties.js** - Party CRUD operations
4. ✅ **leases.js** - Lease and lease version operations
5. ✅ **rent-schedules.js** - Rent schedule operations
6. ✅ **opex-pass-throughs.js** - OpEx pass-through operations
7. ✅ **options.js** - Option operations (including exercise endpoint)
8. ✅ **concessions.js** - Concession operations
9. ✅ **critical-dates.js** - Critical date operations
10. ✅ **doc-links.js** - Document link operations
11. ✅ **reports.js** - Reporting endpoints (read-only)
12. ✅ **batch.js** - Batch operations (write-only)
13. ✅ **nlq.js** - Natural language query (read-only)

### Implementation Pattern
Each Lambda function follows this pattern:

```javascript
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    // ... rest of handler logic ...
    
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
    
    // ... rest of error handling ...
  }
};
```

## Logging Implementation

### Authorization Logging
All authorization decisions are logged with the following information:
- **Role**: The IAM role extracted from the request
- **Principal**: The IAM principal ARN
- **HTTP Method**: The HTTP method being attempted
- **Path**: The API path being accessed
- **Reason**: The reason for allowing or denying access
- **Timestamp**: Automatic timestamp from logger

### Log Levels
- **INFO**: Successful authorization attempts
- **WARN**: Denied authorization attempts
- **ERROR**: Authorization errors or exceptions

### Example Log Entries

**Successful Authorization:**
```json
{
  "level": "INFO",
  "message": "Authorization granted",
  "role": "lease_app_rw",
  "principal": "arn:aws:iam::123456789012:role/lease_app_rw",
  "httpMethod": "POST",
  "path": "/properties",
  "reason": "lease_app_rw has full access",
  "timestamp": "2025-11-11T10:30:00.000Z"
}
```

**Denied Authorization:**
```json
{
  "level": "WARN",
  "message": "Authorization denied",
  "role": "analyst_ro",
  "principal": "arn:aws:iam::123456789012:role/analyst_ro",
  "httpMethod": "POST",
  "path": "/properties",
  "reason": "analyst_ro does not have write access",
  "timestamp": "2025-11-11T10:30:00.000Z"
}
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

### Response Headers
- `Content-Type: application/json`
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`
- `X-Correlation-ID: <correlation-id>` (if available)

## Role Extraction

### Primary Method (Lambda Authorizer)
The role is extracted from `event.requestContext.authorizer.role`, which is injected by the Lambda authorizer (Task 16.1).

### Fallback Method (Direct Invocation)
For direct Lambda invocations, the role is extracted from the IAM user ARN using regex pattern matching:
- Pattern: `/role\/(lease_app_rw|analyst_ro|admin_dba)/`
- Extracts role name from ARN path

### Principal Extraction
The IAM principal is extracted in order of preference:
1. `event.requestContext.authorizer.principalArn`
2. `event.requestContext.identity.userArn`
3. `event.requestContext.identity.caller`
4. Default: `'unknown'`

## Access Control Matrix

| Role          | GET | POST | PUT | DELETE | PATCH |
|---------------|-----|------|-----|--------|-------|
| lease_app_rw  | ✅  | ✅   | ✅  | ✅     | ✅    |
| analyst_ro    | ✅  | ❌   | ❌  | ❌     | ❌    |
| admin_dba     | ✅  | ✅   | ✅  | ✅     | ✅    |

## Testing Recommendations

### Unit Tests
1. Test `extractRole()` with various event structures
2. Test `extractPrincipal()` with various event structures
3. Test `checkPermission()` for all role/method combinations
4. Test `authorizeRequest()` throws error for denied access
5. Test `createForbiddenResponse()` format

### Integration Tests
1. Test each Lambda function with `lease_app_rw` role (should allow all operations)
2. Test each Lambda function with `analyst_ro` role (should allow GET, deny POST/PUT/DELETE)
3. Test each Lambda function with `admin_dba` role (should allow all operations)
4. Test each Lambda function with no role (should deny all operations)
5. Test each Lambda function with unknown role (should deny all operations)
6. Verify authorization logs are written correctly
7. Verify 403 responses have correct format

### Load Tests
1. Test authorization performance under high load
2. Verify no authorization bypass under concurrent requests
3. Test authorization with expired credentials

## Security Considerations

### Implemented Security Measures
1. ✅ All Lambda functions require authorization
2. ✅ Authorization is checked before any business logic
3. ✅ Authorization failures are logged
4. ✅ Detailed error messages are not exposed to clients
5. ✅ Role extraction has fallback mechanisms
6. ✅ Unknown roles are denied by default
7. ✅ All authorization decisions are logged with principal

### Additional Recommendations
1. Implement rate limiting per role
2. Add IP allowlisting for admin_dba role
3. Implement session timeout for long-running operations
4. Add audit trail for all write operations
5. Implement MFA requirement for admin_dba role
6. Add anomaly detection for unusual access patterns

## Integration with Lambda Authorizer

The authorization module works in conjunction with the Lambda authorizer (Task 16.1):

1. **API Gateway** receives request with IAM signature
2. **Lambda Authorizer** validates IAM signature and extracts role
3. **Lambda Authorizer** injects role into `event.requestContext.authorizer.role`
4. **Lambda Function** calls `db.authorization.authorizeRequest(event)`
5. **Authorization Module** extracts role and validates permissions
6. **Authorization Module** logs decision and either allows or denies request

## Compliance

### Requirements Compliance
- ✅ **22.2**: Role-based access control implemented
- ✅ **22.3**: Read-only access for analyst_ro role
- ✅ **22.4**: Read-write access for lease_app_rw and admin_dba roles
- ✅ **22.5**: All access attempts logged with user identity and timestamp

### Standards Compliance
- ✅ Principle of least privilege
- ✅ Defense in depth (authorization at multiple layers)
- ✅ Audit logging for compliance
- ✅ Separation of duties (different roles for different access levels)

## Maintenance

### Adding New Roles
To add a new role:
1. Add role constant to `ROLES` object in `authorization.js`
2. Add role case to `checkPermission()` function
3. Update access control matrix documentation
4. Add integration tests for new role
5. Update Lambda authorizer to recognize new role

### Adding New Lambda Functions
To add authorization to a new Lambda function:
1. Import `db` module: `const db = require('./db');`
2. Add authorization call after logging: `const authResult = db.authorization.authorizeRequest(event);`
3. Add authorization error handling in catch block
4. Test with all roles
5. Update this documentation

## Conclusion

Role-based access control has been successfully implemented across all Lambda API functions. The implementation:
- ✅ Blocks POST/PUT/DELETE operations for analyst_ro role
- ✅ Allows all operations for lease_app_rw and admin_dba roles
- ✅ Logs all authorization decisions with IAM principal
- ✅ Provides consistent error responses
- ✅ Integrates with Lambda authorizer
- ✅ Meets all requirements (22.2, 22.3, 22.4, 22.5)

The system is ready for deployment and testing.
