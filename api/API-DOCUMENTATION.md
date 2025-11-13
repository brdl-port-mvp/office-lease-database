# Office Lease Database API Documentation

Complete API reference for the Office Lease Data Platform.

## Base URL

```
https://<api-id>.execute-api.<region>.amazonaws.com
```

Get your API URL from CloudFormation outputs:
```bash
aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text
```

## Authentication

All endpoints require AWS IAM authentication using Signature Version 4.

### Using AWS CLI

```bash
curl -X GET "$API_URL/properties" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
```

### Using AWS SDK (JavaScript)

```javascript
const AWS = require('aws-sdk');
const axios = require('axios');
const aws4 = require('aws4');

const request = {
  host: 'your-api-id.execute-api.us-east-1.amazonaws.com',
  method: 'GET',
  url: 'https://your-api-id.execute-api.us-east-1.amazonaws.com/properties',
  path: '/properties'
};

aws4.sign(request, {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const response = await axios(request);
```

## Authorization Roles

### lease_app_rw
- Full CRUD access to all endpoints
- Used by application services

### analyst_ro
- Read-only access (GET requests only)
- Used by analysts and BI tools
- POST/PUT/DELETE requests return 403

### admin_dba
- Full access including administrative operations
- Used for database management

## Common Response Formats

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "metadata": {
    "request_id": "abc123",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "property_name",
        "message": "Property name is required"
      }
    ]
  },
  "metadata": {
    "request_id": "abc123",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Pagination

List endpoints support pagination:

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total_count": 150,
    "total_pages": 3
  }
}
```

## Endpoints

### Properties

#### Create Property

```http
POST /properties
```

**Request Body:**
```json
{
  "property_name": "Downtown Office Tower",
  "address": "123 Main St",
  "city": "San Francisco",
  "state_province": "CA",
  "postal_code": "94105",
  "country": "USA",
  "property_type": "OFFICE",
  "total_square_feet": 250000.00
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "property_id": 1,
    "property_name": "Downtown Office Tower",
    "address": "123 Main St",
    "city": "San Francisco",
    "state_province": "CA",
    "postal_code": "94105",
    "country": "USA",
    "property_type": "OFFICE",
    "total_square_feet": 250000.00,
    "active": true,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

#### List Properties

```http
GET /properties?page=1&page_size=50&property_type=OFFICE&city=San Francisco
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `page_size` (optional): Items per page (default: 50, max: 100)
- `property_type` (optional): Filter by property type
- `city` (optional): Filter by city
- `state_province` (optional): Filter by state/province
- `active` (optional): Filter by active status (true/false)
- `sort_by` (optional): Sort field (property_name, city, created_at)
- `sort_order` (optional): Sort order (asc, desc)

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "property_id": 1,
      "property_name": "Downtown Office Tower",
      ...
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total_count": 25,
    "total_pages": 1
  }
}
```

#### Get Property

```http
GET /properties/{id}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "property_id": 1,
    "property_name": "Downtown Office Tower",
    ...
  }
}
```

#### Update Property

```http
PUT /properties/{id}
```

**Request Body:**
```json
{
  "property_name": "Downtown Office Tower - Updated",
  "total_square_feet": 260000.00
}
```

**Response:** `200 OK`

#### Delete Property

```http
DELETE /properties/{id}
```

**Response:** `204 No Content`

---

### Suites

#### Create Suite

```http
POST /suites
```

**Request Body:**
```json
{
  "property_id": 1,
  "suite_code": "Suite 1200",
  "floor": "12",
  "square_feet": 5000.00,
  "usable_square_feet": 4500.00
}
```

**Response:** `201 Created`

#### List Suites

```http
GET /suites?property_id=1
```

**Query Parameters:**
- `property_id` (optional): Filter by property
- `floor` (optional): Filter by floor
- `page`, `page_size`, `sort_by`, `sort_order`

**Response:** `200 OK`

---

### Parties

#### Create Party

```http
POST /parties
```

**Request Body:**
```json
{
  "party_name": "Acme Corporation",
  "party_type": "TENANT",
  "contact_name": "John Doe",
  "contact_email": "john@acme.com",
  "contact_phone": "+1-555-0100"
}
```

**party_type values:** `TENANT`, `LANDLORD`, `GUARANTOR`, `BROKER`, `OTHER`

**Response:** `201 Created`

#### List Parties

```http
GET /parties?party_type=TENANT&active=true
```

**Response:** `200 OK`

---

### Leases

#### Create Lease

```http
POST /leases
```

**Request Body:**
```json
{
  "property_id": 1,
  "suite_id": 1,
  "tenant_id": 1,
  "landlord_id": 2,
  "master_lease_num": "ML-2024-001",
  "lease_state": "ACTIVE",
  "initial_version": {
    "version_num": 1,
    "version_type": "ORIGINAL",
    "effective_daterange": "[2024-01-01,2029-01-01)",
    "execution_date": "2023-12-15",
    "commencement_date": "2024-01-01",
    "expiration_date": "2029-01-01",
    "base_rent_amount": 25000.00,
    "base_rent_basis": "MONTH",
    "escalation_method": "FIXED_PERCENT",
    "escalation_value": 3.00
  }
}
```

**Response:** `201 Created`

#### List Leases

```http
GET /leases?property_id=1&lease_state=ACTIVE
```

**Query Parameters:**
- `property_id` (optional): Filter by property
- `tenant_id` (optional): Filter by tenant
- `lease_state` (optional): Filter by state (ACTIVE, EXPIRED, TERMINATED)
- `expiring_within_days` (optional): Filter leases expiring within N days

**Response:** `200 OK`

#### Get Lease

```http
GET /leases/{id}
```

Returns lease with current version details.

**Response:** `200 OK`

#### Create Lease Amendment

```http
POST /leases/{id}/versions
```

**Request Body:**
```json
{
  "version_num": 2,
  "version_type": "AMENDMENT",
  "effective_daterange": "[2026-01-01,2029-01-01)",
  "execution_date": "2025-12-15",
  "base_rent_amount": 28000.00,
  "base_rent_basis": "MONTH",
  "escalation_method": "FIXED_PERCENT",
  "escalation_value": 3.50,
  "amendment_notes": "Rent increase amendment"
}
```

**Response:** `201 Created`

---

### Rent Schedules

#### Create Rent Schedule

```http
POST /rent-schedules
```

**Request Body:**
```json
{
  "lease_version_id": 1,
  "period_daterange": "[2024-01-01,2025-01-01)",
  "rent_amount": 25000.00,
  "basis": "MONTH"
}
```

**Response:** `201 Created`

#### List Rent Schedules

```http
GET /rent-schedules?lease_version_id=1
```

**Response:** `200 OK`

---

### OpEx Pass-Throughs

#### Create OpEx Pass-Through

```http
POST /opex-pass-throughs
```

**Request Body:**
```json
{
  "lease_version_id": 1,
  "method": "BASE_YEAR",
  "base_year": 2024,
  "tenant_share_pct": 5.25,
  "stop_amount": 15.00,
  "gross_up_pct": 95.00
}
```

**method values:** `BASE_YEAR`, `EXPENSE_STOP`, `NNN`, `OTHER`

**Response:** `201 Created`

---

### Options

#### Create Option

```http
POST /options
```

**Request Body:**
```json
{
  "lease_version_id": 1,
  "option_type": "RENEWAL",
  "window_daterange": "[2028-07-01,2028-10-01)",
  "term_months": 60,
  "rent_adjustment": "Market rate at time of renewal",
  "notes": "5-year renewal option"
}
```

**option_type values:** `RENEWAL`, `EXPANSION`, `TERMINATION`, `EXTENSION`, `OTHER`

**Response:** `201 Created`

#### Exercise Option

```http
PUT /options/{id}/exercise
```

**Request Body:**
```json
{
  "exercised_date": "2028-08-15"
}
```

**Response:** `200 OK`

---

### Concessions

#### Create Concession

```http
POST /concessions
```

**Request Body:**
```json
{
  "lease_version_id": 1,
  "kind": "TI_ALLOWANCE",
  "value_amount": 150000.00,
  "value_basis": "TOTAL",
  "description": "Tenant improvement allowance"
}
```

**kind values:** `TI_ALLOWANCE`, `FREE_RENT`, `OTHER`
**value_basis values:** `TOTAL`, `PER_SF`

**Response:** `201 Created`

---

### Critical Dates

#### Create Critical Date

```http
POST /critical-dates
```

**Request Body:**
```json
{
  "lease_id": 1,
  "kind": "NOTICE",
  "date_value": "2028-07-01",
  "description": "Renewal option notice deadline"
}
```

**kind values:** `COMMENCEMENT`, `RENT_START`, `EXPIRATION`, `NOTICE`, `OTHER`

**Response:** `201 Created`

---

### Document Links

#### Create Document Link

```http
POST /doc-links
```

**Request Body:**
```json
{
  "lease_id": 1,
  "doc_type": "LEASE_AGREEMENT",
  "external_ref": "https://docs.example.com/lease-123.pdf",
  "description": "Original lease agreement"
}
```

**Response:** `201 Created`

---

### Reports

#### Expirations Report

```http
GET /reports/expirations?months=12&lease_state=ACTIVE
```

**Query Parameters:**
- `months` (optional): Lookahead period in months (default: 12)
- `lease_state` (optional): Filter by lease state
- `property_id` (optional): Filter by property

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "lease_id": 1,
      "master_lease_num": "ML-2024-001",
      "property_name": "Downtown Office Tower",
      "tenant_name": "Acme Corporation",
      "expiration_date": "2025-01-01",
      "months_to_expiration": 11,
      "current_rent": 25000.00,
      "square_feet": 5000.00
    }
  ]
}
```

#### Rent Roll Report

```http
GET /reports/rent-roll?property_id=1&as_of_date=2024-01-15
```

**Query Parameters:**
- `property_id` (optional): Filter by property
- `as_of_date` (optional): Report date (default: today)
- `format` (optional): Response format (json, csv)

**Response:** `200 OK`

#### Options Status Report

```http
GET /reports/options?option_type=RENEWAL&window_status=open
```

**Query Parameters:**
- `option_type` (optional): Filter by option type
- `window_status` (optional): Filter by window status (open, closed, upcoming)

**Response:** `200 OK`

#### Free Rent Status Report

```http
GET /reports/free-rent?active_only=true
```

**Response:** `200 OK`

#### TI Allowance Summary Report

```http
GET /reports/ti-allowances?lease_id=1
```

**Response:** `200 OK`

#### Critical Dates Report

```http
GET /reports/critical-dates?days_ahead=180&kind=NOTICE
```

**Query Parameters:**
- `days_ahead` (optional): Lookahead period in days (default: 180)
- `kind` (optional): Filter by date kind

**Response:** `200 OK`

#### Amendment History Report

```http
GET /reports/amendments?lease_id=1
```

**Response:** `200 OK`

#### OpEx Summary Report

```http
GET /reports/opex-summary?property_id=1
```

**Response:** `200 OK`

---

### Batch Operations

#### Batch Create Properties

```http
POST /batch/properties
```

**Request Body:**
```json
{
  "properties": [
    {
      "property_name": "Property 1",
      "address": "123 Main St",
      ...
    },
    {
      "property_name": "Property 2",
      "address": "456 Oak Ave",
      ...
    }
  ]
}
```

**Limits:** Maximum 100 records per batch

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "total": 2,
    "succeeded": 2,
    "failed": 0,
    "results": [
      {
        "index": 0,
        "success": true,
        "property_id": 1
      },
      {
        "index": 1,
        "success": true,
        "property_id": 2
      }
    ]
  }
}
```

#### Batch Create Parties

```http
POST /batch/parties
```

**Request Body:**
```json
{
  "parties": [ ... ]
}
```

**Response:** `200 OK`

#### Batch Create Leases

```http
POST /batch/leases
```

**Request Body:**
```json
{
  "leases": [
    {
      "property_id": 1,
      "suite_id": 1,
      "tenant_id": 1,
      "landlord_id": 2,
      "master_lease_num": "ML-2024-001",
      "initial_version": { ... }
    }
  ]
}
```

**Response:** `200 OK`

---

### Natural Language Query

#### Execute Natural Language Query

```http
POST /query/natural-language
```

**Request Body:**
```json
{
  "query": "Show me all leases expiring in the next 6 months at Downtown Office Tower"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "intent": "expiration_report",
    "confidence": 0.95,
    "parameters": {
      "months": 6,
      "property_name": "Downtown Office Tower"
    },
    "results": [ ... ],
    "execution_time_ms": 245
  }
}
```

**Supported Query Types:**
- Lease expirations
- Rent roll reports
- Option status
- Free rent periods
- Critical dates
- Financial summaries

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate) |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `INTERNAL_ERROR` | 500 | Server error |
| `DATABASE_ERROR` | 500 | Database operation failed |

---

## Rate Limits

- **Default:** 1000 requests/second
- **Burst:** 2000 requests

Rate limit headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642252800
```

---

## Versioning

API version is included in response headers:
```
X-API-Version: 1.0.0
```

---

## Support

For issues or questions:
- Check CloudWatch Logs for error details
- Review API Gateway metrics in CloudWatch
- Contact: support@example.com
