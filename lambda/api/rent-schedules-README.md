# Rent Schedule API Lambda Function

## Overview

This Lambda function handles CRUD operations for rent schedules in the Office Lease Data Platform. Rent schedules define base rent periods with amounts and billing basis (monthly or annual) for each lease version.

## Endpoints

### POST /rent-schedules
Create a new rent schedule with overlap validation.

**Request Body:**
```json
{
  "lease_version_id": 1,
  "period_daterange": "[2024-01-01,2025-01-01)",
  "amount": 5000.00,
  "basis": "MONTH"
}
```

**Validation:**
- `lease_version_id`: Required, must reference existing lease version
- `period_daterange`: Required, PostgreSQL daterange format
- `amount`: Required, non-negative number
- `basis`: Required, must be "MONTH" or "YEAR"
- No overlapping `period_daterange` per `lease_version_id`

**Response:** 201 Created with rent schedule object

### GET /rent-schedules
List rent schedules with filtering and pagination.

**Query Parameters:**
- `lease_version_id`: Filter by lease version ID
- `sort_by`: Sort field (rent_id, period_daterange, amount, created_at)
- `sort_order`: ASC or DESC
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)

**Response:** 200 OK with paginated list

### GET /rent-schedules/{id}
Get a single rent schedule by ID.

**Response:** 200 OK with rent schedule object, or 404 Not Found

### PUT /rent-schedules/{id}
Update an existing rent schedule.

**Request Body:**
```json
{
  "period_daterange": "[2024-01-01,2025-01-01)",
  "amount": 5500.00,
  "basis": "MONTH"
}
```

**Validation:**
- All fields optional
- Same validation rules as POST
- Overlap check excludes current record

**Response:** 200 OK with updated rent schedule object

### DELETE /rent-schedules/{id}
Delete a rent schedule.

**Response:** 204 No Content

## Features

### Overlap Detection
The function enforces that no two rent schedules for the same lease version can have overlapping date ranges. This is validated both in application code and by the database exclusion constraint.

### Monthly/Annual Equivalents
The function automatically calculates:
- `monthly_equiv`: For YEAR basis, divides amount by 12
- `annualized_equiv`: For MONTH basis, multiplies amount by 12

### Error Handling
- **400 Bad Request**: Invalid input data or validation errors
- **404 Not Found**: Rent schedule or lease version not found
- **409 Conflict**: Overlapping date ranges
- **500 Internal Server Error**: Unexpected errors

## Database Schema

```sql
CREATE TABLE rent_schedule (
    rent_id SERIAL PRIMARY KEY,
    lease_version_id INTEGER NOT NULL,
    period_daterange DATERANGE NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    basis VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rent_schedule_version FOREIGN KEY (lease_version_id) 
        REFERENCES lease_version(lease_version_id) ON DELETE RESTRICT,
    CONSTRAINT chk_basis CHECK (basis IN ('MONTH', 'YEAR')),
    EXCLUDE USING GIST (lease_version_id WITH =, period_daterange WITH &&)
);
```

## Requirements Addressed

This implementation addresses the following requirements from the specification:

- **5.1**: Store Rent Schedule records with lease version reference, period date range, amount, and basis
- **5.2**: Support basis values of MONTH and YEAR
- **5.3**: Enforce that period date ranges do not overlap within a single Lease Version
- **5.4**: Calculate monthly equivalent when basis is YEAR (amount / 12)
- **5.5**: Calculate annual equivalent when basis is MONTH (amount * 12)
- **21.1**: Provide REST API endpoints for creating, reading, updating, and deleting rent schedules
- **21.2**: Support query parameters for filtering by lease_version_id
- **21.3**: Support sorting and pagination on list endpoints
- **21.4**: Return responses in JSON format
- **21.5**: Implement proper HTTP status codes for success and error conditions

## Dependencies

- `pg`: PostgreSQL client for Node.js
- `./db`: Database connection and query utilities
- `./db/errors`: Error handling and mapping
- `./db/logger`: Structured logging

## Environment Variables

- `DB_HOST`: Database host (RDS Proxy endpoint)
- `DB_PORT`: Database port (default: 5432)
- `DB_NAME`: Database name
- `DB_SECRET_ARN`: Secrets Manager ARN for database credentials
- `NODE_ENV`: Environment (production, development)

## IAM Permissions Required

- `rds-db:connect`: Connect to RDS Proxy
- `secretsmanager:GetSecretValue`: Retrieve database credentials
- `kms:Decrypt`: Decrypt secrets
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`: CloudWatch logging
- `ec2:CreateNetworkInterface`, `ec2:DescribeNetworkInterfaces`, `ec2:DeleteNetworkInterface`: VPC access

## Testing

See the constraint validation tests in `schema/migrations/tests/constraint_validation_tests.sql` for database-level validation tests.

## Deployment

This Lambda function should be deployed with:
- VPC configuration to access RDS Proxy
- Security group allowing outbound connections to RDS Proxy
- IAM role with required permissions (lease_app_rw)
- Environment variables configured
- API Gateway integration for HTTP endpoints
