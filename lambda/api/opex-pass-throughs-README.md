# OpEx Pass-Through API Lambda Function

## Overview

This Lambda function handles CRUD operations for operating expense pass-through configurations in the Office Lease Data Platform. OpEx pass-throughs define how operating expenses are recovered from tenants, including methods like base year, expense stop, NNN (triple net), and other custom arrangements.

## Endpoints

### POST /opex-pass-throughs
Create a new OpEx pass-through configuration.

**Request Body:**
```json
{
  "lease_version_id": 1,
  "method": "BASE_YEAR",
  "stop_amount": 15000.00,
  "gross_up_pct": 95.0,
  "notes": "Base year 2024 with 95% occupancy gross-up"
}
```

**Validation:**
- `lease_version_id`: Required, must reference existing lease version
- `method`: Required, must be "BASE_YEAR", "EXPENSE_STOP", "NNN", or "OTHER"
- `stop_amount`: Optional, non-negative number
- `gross_up_pct`: Optional, number between 0 and 100
- `notes`: Optional, text string

**Response:** 201 Created with OpEx pass-through object

### GET /opex-pass-throughs
List OpEx pass-throughs with filtering and pagination.

**Query Parameters:**
- `lease_version_id`: Filter by lease version ID
- `method`: Filter by OpEx method (BASE_YEAR, EXPENSE_STOP, NNN, OTHER)
- `sort_by`: Sort field (opex_id, method, stop_amount, created_at)
- `sort_order`: ASC or DESC
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)

**Response:** 200 OK with paginated list

### GET /opex-pass-throughs/{id}
Get a single OpEx pass-through by ID.

**Response:** 200 OK with OpEx pass-through object, or 404 Not Found

### PUT /opex-pass-throughs/{id}
Update an existing OpEx pass-through configuration.

**Request Body:**
```json
{
  "method": "EXPENSE_STOP",
  "stop_amount": 18000.00,
  "gross_up_pct": 90.0,
  "notes": "Updated to expense stop method"
}
```

**Validation:**
- All fields optional
- Same validation rules as POST

**Response:** 200 OK with updated OpEx pass-through object

### DELETE /opex-pass-throughs/{id}
Delete an OpEx pass-through configuration.

**Response:** 204 No Content

## OpEx Methods

### BASE_YEAR
Tenant pays their proportionate share of increases in operating expenses over a base year amount. The base year is typically the first year of the lease or the calendar year in which the lease commences.

### EXPENSE_STOP
Tenant pays their proportionate share of operating expenses above a fixed dollar amount (the "stop"). The landlord absorbs expenses up to the stop amount.

### NNN (Triple Net)
Tenant pays their proportionate share of all operating expenses, including real estate taxes, insurance, and common area maintenance. No base year or stop applies.

### OTHER
Custom or hybrid OpEx recovery methods that don't fit the standard categories.

## Features

### Method Validation
The function enforces that the `method` field must be one of the four allowed values: BASE_YEAR, EXPENSE_STOP, NNN, or OTHER. This is validated both in application code and by the database check constraint.

### Optional Fields
The `stop_amount`, `gross_up_pct`, and `notes` fields are optional, allowing flexibility for different OpEx arrangements:
- `stop_amount`: Used primarily with EXPENSE_STOP method
- `gross_up_pct`: Percentage used to gross up expenses to account for vacancy
- `notes`: Free-form text for additional details

### Error Handling
- **400 Bad Request**: Invalid input data or validation errors
- **404 Not Found**: OpEx pass-through or lease version not found
- **409 Conflict**: Database constraint violations
- **500 Internal Server Error**: Unexpected errors

## Database Schema

```sql
CREATE TABLE opex_pass_through (
    opex_id SERIAL PRIMARY KEY,
    lease_version_id INTEGER NOT NULL,
    method VARCHAR(50) NOT NULL,
    stop_amount NUMERIC(15, 2),
    gross_up_pct NUMERIC(5, 2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_opex_version FOREIGN KEY (lease_version_id) 
        REFERENCES lease_version(lease_version_id) ON DELETE RESTRICT,
    CONSTRAINT chk_opex_method CHECK (method IN ('BASE_YEAR', 'EXPENSE_STOP', 'NNN', 'OTHER'))
);
```

## Requirements Addressed

This implementation addresses the following requirements from the specification:

- **6.1**: Store OpEx Pass-Through records with lease version reference, method, stop amount, gross-up percentage, and notes
- **6.2**: Support methods of BASE_YEAR, EXPENSE_STOP, NNN, and OTHER
- **6.3**: Allow stop amount and gross-up percentage to be optional
- **21.1**: Provide REST API endpoints for creating, reading, updating, and deleting OpEx pass-throughs
- **21.2**: Support query parameters for filtering by lease_version_id and method
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

## Example Usage

### Create OpEx Configuration
```bash
curl -X POST https://api.example.com/opex-pass-throughs \
  -H "Content-Type: application/json" \
  -d '{
    "lease_version_id": 1,
    "method": "BASE_YEAR",
    "stop_amount": 15000.00,
    "gross_up_pct": 95.0,
    "notes": "Base year 2024"
  }'
```

### List OpEx Configurations for a Lease Version
```bash
curl "https://api.example.com/opex-pass-throughs?lease_version_id=1"
```

### Update OpEx Configuration
```bash
curl -X PUT https://api.example.com/opex-pass-throughs/1 \
  -H "Content-Type: application/json" \
  -d '{
    "stop_amount": 18000.00,
    "notes": "Updated stop amount for 2025"
  }'
```

### Delete OpEx Configuration
```bash
curl -X DELETE https://api.example.com/opex-pass-throughs/1
```
