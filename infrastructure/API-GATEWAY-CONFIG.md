# API Gateway Configuration

## Overview

This document describes the API Gateway configuration for the Office Lease Data Platform. The implementation uses AWS CDK to provision an HTTP API (API Gateway v2) with Lambda integrations, Lambda authorizer, CORS support, throttling, and CloudWatch logging.

## Architecture

```
Client Request
    ↓
API Gateway HTTP API
    ↓
Lambda Authorizer (IAM validation)
    ↓
Lambda Function (endpoint handler)
    ↓
RDS Proxy
    ↓
Aurora PostgreSQL
```

## Components

### 1. HTTP API Gateway

**Type**: HTTP API (API Gateway v2)
- Lower latency than REST API
- Lower cost
- Native support for Lambda proxy integration
- Built-in CORS support

**Configuration**:
- API Name: `office-leases-api`
- Default Stage: `$default` (auto-deploy enabled)
- Throttling: 1000 requests/second, 2000 burst limit
- CloudWatch logging: Full request/response logging

### 2. Lambda Functions

All Lambda functions are configured with:
- Runtime: Node.js 18.x
- VPC: Private subnets with egress
- Security Group: Lambda security group (access to RDS Proxy)
- Timeout: 30 seconds (60 for batch operations)
- Memory: 512 MB (1024 MB for batch operations)
- Log Retention: 30 days
- Execution Role: `lease_app_rw` role

**Functions**:
1. `office-lease-authorizer` - Lambda authorizer for IAM validation
2. `office-lease-api-properties` - Properties CRUD
3. `office-lease-api-suites` - Suites CRUD
4. `office-lease-api-parties` - Parties CRUD
5. `office-lease-api-leases` - Leases and versions CRUD
6. `office-lease-api-rent-schedules` - Rent schedules CRUD
7. `office-lease-api-opex` - OpEx pass-throughs CRUD
8. `office-lease-api-options` - Options CRUD
9. `office-lease-api-concessions` - Concessions CRUD
10. `office-lease-api-critical-dates` - Critical dates CRUD
11. `office-lease-api-doc-links` - Document links CRUD
12. `office-lease-api-reports` - Reporting endpoints
13. `office-lease-api-batch` - Batch operations
14. `office-lease-api-nlq` - Natural language queries

### 3. Lambda Authorizer

**Purpose**: Validate IAM signatures and enforce role-based access control

**Configuration**:
- Type: Lambda authorizer with IAM response type
- Cache TTL: 5 minutes
- Handler: `authorizer.handler`

**Authorization Flow**:
1. Extract IAM principal from request context
2. Validate IAM signature
3. Determine role (lease_app_rw, analyst_ro, admin_dba)
4. Generate IAM policy document
5. Cache authorization decision

### 4. CORS Configuration

**Enabled for all endpoints**:
- Allowed Origins: `*` (configure specific domains in production)
- Allowed Methods: GET, POST, PUT, DELETE, OPTIONS
- Allowed Headers: Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token
- Max Age: 1 hour

### 5. Throttling

**Rate Limits**:
- Steady-state rate: 1000 requests/second
- Burst capacity: 2000 requests

**Configuration**:
- Applied to default stage via `defaultRouteSettings`
- Throttling enforced at API Gateway level
- Returns 429 (Too Many Requests) when limit exceeded

**Per-endpoint throttling** can be configured by modifying individual route settings.

### 6. CloudWatch Logging

**Access Logs**:
- Log Group: `/aws/apigateway/office-lease-api`
- Retention: 30 days
- Format: JSON with request metadata
- Configured on default stage via `accessLogSettings`

**Logged Fields**:
- Request ID (`$context.requestId`)
- Source IP (`$context.identity.sourceIp`)
- Request time (`$context.requestTime`)
- HTTP method (`$context.httpMethod`)
- Route key (`$context.routeKey`)
- Status code (`$context.status`)
- Protocol (`$context.protocol`)
- Response length (`$context.responseLength`)
- Integration error message (`$context.integrationErrorMessage`)

**Metric Filters**:
- Client errors (4xx responses)
- Server errors (5xx responses)
- Lambda errors
- Database connection errors

## API Routes

### Properties
- `GET /properties` - List properties
- `POST /properties` - Create property
- `GET /properties/{id}` - Get property
- `PUT /properties/{id}` - Update property
- `DELETE /properties/{id}` - Delete property

### Suites
- `GET /suites` - List suites
- `POST /suites` - Create suite
- `GET /suites/{id}` - Get suite
- `PUT /suites/{id}` - Update suite
- `DELETE /suites/{id}` - Delete suite

### Parties
- `GET /parties` - List parties
- `POST /parties` - Create party
- `GET /parties/{id}` - Get party
- `PUT /parties/{id}` - Update party
- `DELETE /parties/{id}` - Delete party

### Leases
- `GET /leases` - List leases
- `POST /leases` - Create lease
- `GET /leases/{id}` - Get lease
- `PUT /leases/{id}` - Update lease
- `POST /leases/{id}/versions` - Create amendment

### Rent Schedules
- `GET /rent-schedules` - List rent schedules
- `POST /rent-schedules` - Create rent schedule
- `GET /rent-schedules/{id}` - Get rent schedule
- `PUT /rent-schedules/{id}` - Update rent schedule
- `DELETE /rent-schedules/{id}` - Delete rent schedule

### OpEx Pass-Throughs
- `GET /opex-pass-throughs` - List OpEx configurations
- `POST /opex-pass-throughs` - Create OpEx configuration
- `GET /opex-pass-throughs/{id}` - Get OpEx configuration
- `PUT /opex-pass-throughs/{id}` - Update OpEx configuration
- `DELETE /opex-pass-throughs/{id}` - Delete OpEx configuration

### Options
- `GET /options` - List options
- `POST /options` - Create option
- `GET /options/{id}` - Get option
- `PUT /options/{id}` - Update option
- `DELETE /options/{id}` - Delete option
- `PUT /options/{id}/exercise` - Exercise option

### Concessions
- `GET /concessions` - List concessions
- `POST /concessions` - Create concession
- `GET /concessions/{id}` - Get concession
- `PUT /concessions/{id}` - Update concession
- `DELETE /concessions/{id}` - Delete concession

### Critical Dates
- `GET /critical-dates` - List critical dates
- `POST /critical-dates` - Create critical date
- `GET /critical-dates/{id}` - Get critical date
- `PUT /critical-dates/{id}` - Update critical date
- `DELETE /critical-dates/{id}` - Delete critical date

### Document Links
- `GET /doc-links` - List document links
- `POST /doc-links` - Create document link
- `GET /doc-links/{id}` - Get document link
- `PUT /doc-links/{id}` - Update document link
- `DELETE /doc-links/{id}` - Delete document link

### Reports
- `GET /reports/expirations` - Expirations pipeline
- `GET /reports/rent-roll` - Current rent roll
- `GET /reports/options` - Options status
- `GET /reports/free-rent` - Free rent status
- `GET /reports/ti-allowances` - TI allowance summary
- `GET /reports/critical-dates` - Upcoming critical dates
- `GET /reports/amendments` - Amendment history
- `GET /reports/opex-summary` - OpEx summary

### Batch Operations
- `POST /batch/properties` - Bulk create/update properties
- `POST /batch/parties` - Bulk create/update parties
- `POST /batch/leases` - Bulk create/update leases

### Natural Language Queries
- `POST /query/natural-language` - Process natural language query

## Environment Variables

All Lambda functions receive:
- `DB_PROXY_ENDPOINT` - RDS Proxy endpoint
- `DB_SECRET_ARN` - Secrets Manager ARN for credentials
- `DB_NAME` - Database name (officeLeaseDB)
- `NODE_ENV` - Environment (production)

NLQ function additionally receives:
- `BEDROCK_MODEL_ID` - Bedrock model for intent classification

## Security

### Authentication
- Lambda authorizer validates IAM signatures
- Requests must be signed with AWS Signature Version 4

### Authorization
- Role-based access control enforced by authorizer
- Roles: lease_app_rw, analyst_ro, admin_dba

### Network Security
- Lambda functions in private subnets
- Database in isolated subnets
- Security groups restrict access

### Encryption
- TLS 1.2+ for all API requests
- Database credentials in Secrets Manager
- KMS encryption for data at rest

## Deployment

### Prerequisites
1. Install dependencies: `npm install`
2. Build TypeScript: `npm run build`
3. Configure AWS credentials

### Deploy Stack
```bash
cdk deploy
```

### Outputs
After deployment, CDK outputs:
- `ApiGatewayUrl` - API endpoint URL
- `ApiGatewayId` - API Gateway ID
- All Lambda function ARNs
- Database connection details

## Testing

### Automated Test Script

Run the comprehensive test script to verify all API Gateway configuration:

```bash
chmod +x infrastructure/test-api-gateway.sh
./infrastructure/test-api-gateway.sh
```

The test script verifies:
- API Gateway exists and is accessible
- CORS configuration is correct
- All expected routes are configured
- Lambda integrations are set up
- Lambda authorizer is attached
- Throttling limits are configured
- CloudWatch logging is enabled
- All Lambda functions exist

### Manual API Testing

```bash
# Get API URL from CDK output
API_URL=$(aws cloudformation describe-stacks \
  --stack-name LeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text)

# Test properties endpoint (requires IAM authentication)
curl -X GET "${API_URL}properties" \
  --aws-sigv4 "aws:amz:${AWS_REGION}:execute-api" \
  --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}"
```

### Monitor Logs
```bash
# API Gateway logs
aws logs tail /aws/apigateway/office-lease-api --follow

# Lambda logs
aws logs tail /aws/lambda/office-lease-api --follow
```

## Monitoring

### CloudWatch Dashboards
- API request count, latency, errors
- Lambda invocations, duration, errors
- Database connections, CPU, IOPS

### Alarms
- API error rate > 5% for 5 minutes
- Lambda errors > 10 in 5 minutes
- Database CPU > 80% for 10 minutes

## Troubleshooting

### Common Issues

**1. Lambda timeout**
- Increase timeout in CDK configuration
- Check database query performance
- Verify VPC NAT gateway is working

**2. Authorization failures**
- Verify IAM role has correct permissions
- Check Lambda authorizer logs
- Ensure request is properly signed

**3. CORS errors**
- Verify CORS configuration in API Gateway
- Check allowed origins, methods, headers
- Ensure preflight requests are handled

**4. Database connection errors**
- Verify Lambda security group allows RDS Proxy access
- Check RDS Proxy configuration
- Verify database credentials in Secrets Manager

## Production Considerations

### Custom Domain
Add custom domain configuration:
```typescript
const domainName = new apigatewayv2.DomainName(this, 'ApiDomain', {
  domainName: 'api.example.com',
  certificate: certificate,
});

new apigatewayv2.ApiMapping(this, 'ApiMapping', {
  api: this.httpApi,
  domainName: domainName,
  stage: this.httpApi.defaultStage,
});
```

### WAF Integration
Add AWS WAF for additional security:
```typescript
const webAcl = new wafv2.CfnWebACL(this, 'ApiWaf', {
  scope: 'REGIONAL',
  defaultAction: { allow: {} },
  rules: [/* WAF rules */],
});

new wafv2.CfnWebACLAssociation(this, 'WafAssociation', {
  resourceArn: this.httpApi.arnForExecuteApi(),
  webAclArn: webAcl.attrArn,
});
```

### API Keys
For additional authentication layer:
```typescript
const apiKey = this.httpApi.addApiKey('ApiKey', {
  apiKeyName: 'office-lease-api-key',
});
```

### Request Validation
Add request/response validation schemas for each endpoint.

## Requirements Satisfied

This implementation satisfies the following requirements:

- **21.1**: REST API exposing all database views as queryable endpoints ✓
- **21.2**: API endpoints for CRUD operations on all entities ✓
- **21.3**: Query parameters for filtering, sorting, pagination ✓
- **21.4**: JSON response format ✓
- **21.5**: Proper HTTP status codes ✓
- **22.1**: IAM authentication via Lambda authorizer ✓

## Next Steps

1. Deploy the stack: `cdk deploy`
2. Test all endpoints with sample requests
3. Configure custom domain (optional)
4. Set up monitoring dashboards
5. Configure alarms for production
6. Document API for consumers
