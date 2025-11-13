# Lease API Lambda Functions

This directory contains Lambda functions for the Office Lease Data Platform API.

## Lambda Functions

### Properties API (`properties.js`)

Handles CRUD operations for properties.

**Endpoints:**
- `GET /properties` - List properties with filtering, sorting, and pagination
- `GET /properties/{id}` - Get a single property by ID
- `POST /properties` - Create a new property
- `PUT /properties/{id}` - Update an existing property
- `DELETE /properties/{id}` - Soft delete a property (sets active=false)

**Query Parameters (GET /properties):**
- `name` - Filter by property name (case-insensitive partial match)
- `state` - Filter by state
- `country` - Filter by country
- `active` - Filter by active status (true/false)
- `sort_by` - Sort field (property_id, name, state, total_rsf, created_at)
- `sort_order` - Sort order (ASC/DESC)
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Request Body (POST/PUT):**
```json
{
  "name": "Building A",
  "address": "123 Main St",
  "state": "CA",
  "postal_code": "90210",
  "country": "USA",
  "total_rsf": 50000,
  "active": true
}
```

### Suites API (`suites.js`)

Handles CRUD operations for suites.

**Endpoints:**
- `GET /suites` - List suites with filtering by property
- `GET /suites/{id}` - Get a single suite by ID
- `POST /suites` - Create a new suite
- `PUT /suites/{id}` - Update an existing suite
- `DELETE /suites/{id}` - Delete a suite (hard delete)

**Query Parameters (GET /suites):**
- `property_id` - Filter by property ID
- `suite_code` - Filter by suite code (case-insensitive partial match)
- `sort_by` - Sort field (suite_id, property_id, suite_code, rsf, created_at)
- `sort_order` - Sort order (ASC/DESC)
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Request Body (POST/PUT):**
```json
{
  "property_id": 1,
  "suite_code": "Suite 100",
  "rsf": 2500
}
```

**Unique Constraint:**
The combination of `property_id` and `suite_code` must be unique. Attempting to create or update a suite with a duplicate combination will result in a 400 error.

### Parties API (`parties.js`)

Handles CRUD operations for parties (tenants, landlords, guarantors).

**Endpoints:**
- `GET /parties` - List parties with filtering
- `GET /parties/{id}` - Get a single party by ID
- `POST /parties` - Create a new party
- `PUT /parties/{id}` - Update an existing party
- `DELETE /parties/{id}` - Soft delete a party (sets active=false)

### Leases API (`leases.js`)

Handles CRUD operations for leases and lease versions.

**Endpoints:**
- `GET /leases` - List leases with filtering
- `GET /leases/{id}` - Get a single lease by ID
- `POST /leases` - Create a new lease
- `PUT /leases/{id}` - Update an existing lease
- `POST /leases/{id}/versions` - Create a new lease version (amendment)

### Rent Schedules API (`rent-schedules.js`)

Handles CRUD operations for rent schedules.

**Endpoints:**
- `GET /rent-schedules` - List rent schedules by lease version
- `GET /rent-schedules/{id}` - Get a single rent schedule by ID
- `POST /rent-schedules` - Create a new rent schedule
- `PUT /rent-schedules/{id}` - Update an existing rent schedule
- `DELETE /rent-schedules/{id}` - Delete a rent schedule

### OpEx Pass-Through API (`opex-pass-throughs.js`)

Handles CRUD operations for operating expense pass-through configurations.

**Endpoints:**
- `GET /opex-pass-throughs` - List OpEx configurations by lease version
- `GET /opex-pass-throughs/{id}` - Get a single OpEx configuration by ID
- `POST /opex-pass-throughs` - Create a new OpEx configuration
- `PUT /opex-pass-throughs/{id}` - Update an existing OpEx configuration
- `DELETE /opex-pass-throughs/{id}` - Delete an OpEx configuration

### Options API (`options.js`)

Handles CRUD operations for lease options (renewal, termination, expansion, ROFR).

**Endpoints:**
- `GET /options` - List options by lease version
- `GET /options/{id}` - Get a single option by ID
- `POST /options` - Create a new option
- `PUT /options/{id}` - Update an existing option
- `PUT /options/{id}/exercise` - Mark an option as exercised
- `DELETE /options/{id}` - Delete an option

### Concessions API (`concessions.js`)

Handles CRUD operations for lease concessions (TI allowances, free rent).

**Endpoints:**
- `GET /concessions` - List concessions by lease version
- `GET /concessions/{id}` - Get a single concession by ID
- `POST /concessions` - Create a new concession
- `PUT /concessions/{id}` - Update an existing concession
- `DELETE /concessions/{id}` - Delete a concession

### Critical Dates API (`critical-dates.js`)

Handles CRUD operations for critical dates (commencement, rent start, expiration, notice deadlines).

**Endpoints:**
- `GET /critical-dates` - List critical dates by lease
- `GET /critical-dates/{id}` - Get a single critical date by ID
- `POST /critical-dates` - Create a new critical date
- `PUT /critical-dates/{id}` - Update an existing critical date
- `DELETE /critical-dates/{id}` - Delete a critical date

### Document Links API (`doc-links.js`)

Handles CRUD operations for document links (external references to lease documents).

**Endpoints:**
- `GET /doc-links` - List document links by lease
- `GET /doc-links/{id}` - Get a single document link by ID
- `POST /doc-links` - Create a new document link
- `PUT /doc-links/{id}` - Update an existing document link
- `DELETE /doc-links/{id}` - Delete a document link

**External Reference Format:**
- URL format: `https://docs.example.com/lease-001.pdf`
- ECM identifier format: `ECM-12345`, `DOC_ABC_123`, `lease.2024.001`

## Database Layer

The `db/` directory contains shared database utilities:

- `connection.js` - Connection pooling and query execution
- `errors.js` - Error mapping and standardized responses
- `logger.js` - Structured logging with correlation IDs
- `index.js` - Unified export of all database utilities

## Environment Variables

Required environment variables:

- `DB_SECRET_ARN` - ARN of the Secrets Manager secret containing database credentials
- `DB_NAME` - Database name (default: lease_db)
- `DB_PROXY_ENDPOINT` - RDS Proxy endpoint (optional, falls back to direct RDS)
- `AWS_REGION` - AWS region (default: us-east-1)
- `LOG_LEVEL` - Logging level (DEBUG, INFO, WARN, ERROR)
- `NODE_ENV` - Environment (production/development)

## Error Responses

All endpoints return standardized error responses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid property data",
    "details": [
      {
        "field": "name",
        "message": "Property name is required"
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

## Response Headers

All responses include:
- `Content-Type: application/json`
- `Access-Control-Allow-Origin: *`
- `X-Correlation-ID` - Request correlation ID for tracing

## Pagination Response Format

List endpoints return paginated results:

```json
{
  "data": [...],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "count": 50
  }
}
```
