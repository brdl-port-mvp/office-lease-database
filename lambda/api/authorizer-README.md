# Lambda Authorizer for API Gateway

## Overview

The Lambda authorizer validates IAM signatures and generates IAM policy documents based on the caller's role. It supports three roles with different permission levels:

- **lease_app_rw**: Full CRUD access to all endpoints
- **analyst_ro**: Read-only access (GET requests only)
- **admin_dba**: Full administrative access

## Features

- **IAM-based Authentication**: Validates AWS IAM signatures from API Gateway requests
- **Role-based Authorization**: Extracts role from IAM principal ARN and generates appropriate policies
- **Policy Caching**: Caches authorization decisions for 5 minutes to improve performance
- **Automatic Cache Cleanup**: Removes expired cache entries when cache size exceeds 1000 entries
- **Context Injection**: Passes role and principal information to downstream Lambda functions

## Role Permissions

### lease_app_rw (Service Role)
- **Allowed**: All HTTP methods (GET, POST, PUT, DELETE, PATCH) on all resources
- **Use Case**: Application services, batch jobs, automated processes

### analyst_ro (User Role)
- **Allowed**: GET and OPTIONS requests on all resources
- **Denied**: POST, PUT, DELETE, PATCH requests
- **Use Case**: Analysts, BI tools, reporting dashboards

### admin_dba (Admin Role)
- **Allowed**: All HTTP methods on all resources
- **Use Case**: Database administrators, DevOps, schema migrations

## Request Flow

1. API Gateway receives request with IAM signature
2. API Gateway invokes Lambda authorizer
3. Authorizer extracts IAM principal from request context
4. Authorizer extracts role from principal ARN
5. Authorizer checks cache for existing policy
6. If not cached, authorizer generates IAM policy based on role
7. Authorizer caches policy for 5 minutes
8. Authorizer returns policy to API Gateway
9. API Gateway evaluates policy and allows/denies request
10. If allowed, API Gateway invokes target Lambda with role context

## IAM Principal Patterns

The authorizer supports multiple IAM principal formats:

```
arn:aws:iam::123456789012:role/lease_app_rw
arn:aws:sts::123456789012:assumed-role/lease_app_rw/session-name
arn:aws:iam::123456789012:role/analyst_ro
arn:aws:sts::123456789012:assumed-role/analyst_ro/user@example.com
arn:aws:iam::123456789012:role/admin_dba
```

## Policy Document Structure

The authorizer generates IAM policy documents in the following format:

```json
{
  "principalId": "arn:aws:iam::123456789012:role/lease_app_rw",
  "policyDocument": {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Action": "execute-api:Invoke",
        "Effect": "Allow",
        "Resource": [
          "arn:aws:execute-api:us-east-1:123456789012:abc123/prod/*/*"
        ]
      }
    ]
  },
  "context": {
    "role": "lease_app_rw",
    "principalArn": "arn:aws:iam::123456789012:role/lease_app_rw",
    "timestamp": "2025-11-11T10:30:00.000Z"
  }
}
```

## Context Variables

The authorizer injects the following context variables that are available to downstream Lambda functions:

- `role`: The extracted role name (lease_app_rw, analyst_ro, admin_dba)
- `principalArn`: The full IAM principal ARN
- `timestamp`: ISO 8601 timestamp of authorization

Access context in Lambda functions via:
```javascript
const role = event.requestContext.authorizer.role;
const principalArn = event.requestContext.authorizer.principalArn;
```

## Caching Strategy

- **Cache Key**: `${principalArn}:${methodArn}`
- **TTL**: 5 minutes (300,000 ms)
- **Max Size**: 1000 entries (automatic cleanup when exceeded)
- **Cleanup**: Removes expired entries when cache size > 1000

## Error Handling

The authorizer throws `Unauthorized` error in the following cases:

- No IAM principal found in request context
- Unable to extract role from principal ARN
- Role is not one of the three supported roles
- Any unexpected error during policy generation

API Gateway translates `Unauthorized` errors to **403 Forbidden** responses.

## Logging

The authorizer logs the following events:

- Authorization invocation with request details
- Cache hits for performance monitoring
- Successful authorizations with principal and role
- Authorization failures with error details
- Cache cleanup operations

## Deployment

The authorizer is deployed as a separate Lambda function and attached to API Gateway as a Lambda authorizer (formerly known as custom authorizer).

### CDK Configuration Example

```typescript
const authorizer = new lambda.Function(this, 'Authorizer', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'authorizer.handler',
  code: lambda.Code.fromAsset('lambda/api'),
  timeout: cdk.Duration.seconds(10),
});

const apiAuthorizer = new apigateway.RequestAuthorizer(this, 'ApiAuthorizer', {
  handler: authorizer,
  identitySources: [apigateway.IdentitySource.header('Authorization')],
  resultsCacheTtl: cdk.Duration.minutes(5),
});
```

## Testing

### Test with IAM Role

```bash
# Assume role
aws sts assume-role \
  --role-arn arn:aws:iam::123456789012:role/lease_app_rw \
  --role-session-name test-session

# Use temporary credentials to invoke API
aws apigatewayv2 invoke \
  --api-id abc123 \
  --stage prod \
  --path /properties \
  --method GET
```

### Test with AWS Signature V4

```javascript
const AWS = require('aws-sdk');
const https = require('https');

const credentials = new AWS.Credentials({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
});

const signer = new AWS.Signers.V4(request, 'execute-api');
signer.addAuthorization(credentials, new Date());
```

## Performance Considerations

- **Cache Hit Rate**: Monitor cache hit rate to optimize TTL
- **Cold Starts**: Authorizer has minimal cold start impact (~100ms)
- **Memory**: 128 MB is sufficient for authorizer function
- **Timeout**: 10 seconds is recommended (actual execution < 1 second)

## Security Considerations

- **Principle of Least Privilege**: Each role has minimal required permissions
- **No Credential Storage**: Authorizer does not store or log credentials
- **Audit Logging**: All authorization decisions are logged to CloudWatch
- **Cache Isolation**: Cache keys include principal ARN to prevent cross-principal access
- **Deny by Default**: Unknown roles are denied all access

## Monitoring

Monitor the following CloudWatch metrics:

- **Invocations**: Total authorizer invocations
- **Errors**: Authorization failures
- **Duration**: Execution time (should be < 100ms for cache hits)
- **Cache Size**: Number of cached policies
- **Cache Hit Rate**: Percentage of requests served from cache

## Troubleshooting

### 403 Forbidden Errors

1. Check that the IAM principal has the correct role name
2. Verify the role ARN matches one of the three supported roles
3. Check CloudWatch logs for authorization failure details
4. Ensure API Gateway is configured to use the authorizer

### Cache Issues

1. Monitor cache size in CloudWatch logs
2. Adjust TTL if cache hit rate is too low
3. Increase max cache size if cleanup happens too frequently

### Performance Issues

1. Check authorizer duration in CloudWatch metrics
2. Verify cache is being used (look for cache hit logs)
3. Consider increasing authorizer memory if needed
