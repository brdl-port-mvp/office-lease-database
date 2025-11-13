# Concession API

Lambda function for managing lease concessions (TI allowances, free rent, and other tenant incentives).

## Endpoints

### GET /concessions

List concessions with optional filtering and pagination.

**Query Parameters:**
- `lease_version_id` (optional): Filter by lease version ID
- `kind` (optional): Filter by concession kind (TI_ALLOWANCE, FREE_RENT, OTHER)
- `value_basis` (optional): Filter by value basis (TOTAL, PER_SF)
- `sort_by` (optional): Sort field (concession_id, kind, value_amount, value_basis, created_at). Default: concession_id
- `sort_order` (optional): Sort order (ASC, DESC). Default: ASC
- `limit` (optional): Number of records per page. Default: 50
- `offset` (optional): Number of records to skip. Default: 0

**Response:**
```json
{
  "data": [
    {
      "concession_id": 1,
      "lease_version_id": 5,
      "kind": "TI_ALLOWANCE",
      "value_amount": 50000.00,
      "value_basis": "TOTAL",
      "applies_daterange": "[2024-01-01,2024-12-31)",
      "notes": "Tenant improvement allowance for office build-out",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z",
      "months_remaining": null
    },
    {
      "concession_id": 2,
      "lease_version_id": 5,
      "kind": "FREE_RENT",
      "value_amount": 5000.00,
      "value_basis": "TOTAL",
      "applies_daterange": "[2024-01-01,2024-04-01)",
      "notes": "3 months free rent",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z",
      "months_remaining": 2.5
    }
  ],
  "pagination": {
    "total": 2,
    "limit": 50,
    "offset": 0,
    "count": 2
  }
}
```

### GET /concessions/{id}

Get a single concession by ID with months_remaining calculation for FREE_RENT concessions.

**Response:**
```json
{
  "concession_id": 2,
  "lease_version_id": 5,
  "kind": "FREE_RENT",
  "value_amount": 5000.00,
  "value_basis": "TOTAL",
  "applies_daterange": "[2024-01-01,2024-04-01)",
  "notes": "3 months free rent",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T10:00:00Z",
  "months_remaining": 2.5
}
```

### POST /concessions

Create a new concession.

**Request Body:**
```json
{
  "lease_version_id": 5,
  "kind": "TI_ALLOWANCE",
  "value_amount": 50000.00,
  "value_basis": "TOTAL",
  "applies_daterange": "[2024-01-01,2024-12-31)",
  "notes": "Tenant improvement allowance for office build-out"
}
```

**Required Fields:**
- `lease_version_id`: Integer (must reference existing lease version)
- `kind`: String (TI_ALLOWANCE, FREE_RENT, OTHER)
- `value_amount`: Decimal (non-negative)
- `value_basis`: String (TOTAL, PER_SF)

**Optional Fields:**
- `applies_daterange`: String (PostgreSQL daterange format, e.g., "[2024-01-01,2025-01-01)")
- `notes`: String

**Response:** 201 Created with concession object

### PUT /concessions/{id}

Update an existing concession.

**Request Body:**
```json
{
  "value_amount": 55000.00,
  "notes": "Updated TI allowance amount"
}
```

**Updatable Fields:**
- `kind`: String (TI_ALLOWANCE, FREE_RENT, OTHER)
- `value_amount`: Decimal (non-negative)
- `value_basis`: String (TOTAL, PER_SF)
- `applies_daterange`: String (PostgreSQL daterange format)
- `notes`: String

**Response:** 200 OK with updated concession object

### DELETE /concessions/{id}

Delete a concession.

**Response:** 204 No Content

## Validation Rules

### Kind Enum
Must be one of:
- `TI_ALLOWANCE`: Tenant improvement allowance
- `FREE_RENT`: Free rent period
- `OTHER`: Other concession types

### Value Basis Enum
Must be one of:
- `TOTAL`: Total dollar amount
- `PER_SF`: Amount per square foot

### Value Amount
- Must be a non-negative number
- Required for creation

### Applies Date Range
- Optional field
- Must be in PostgreSQL daterange format: `[start_date,end_date)`
- Example: `[2024-01-01,2025-01-01)` (inclusive start, exclusive end)

### Months Remaining Calculation
For FREE_RENT concessions:
- Calculated as: `(upper_bound_of_daterange - current_date) / 30 days`
- Only calculated when:
  - `kind` = 'FREE_RENT'
  - `applies_daterange` is not null
  - Upper bound of daterange is in the future
- Returns null for non-FREE_RENT concessions or expired periods

## Error Responses

### 400 Bad Request - Validation Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid concession data",
    "details": [
      {
        "field": "kind",
        "message": "Kind must be one of: TI_ALLOWANCE, FREE_RENT, OTHER",
        "allowed_values": ["TI_ALLOWANCE", "FREE_RENT", "OTHER"]
      }
    ]
  }
}
```

### 400 Bad Request - Invalid Reference
```json
{
  "error": {
    "code": "INVALID_REFERENCE",
    "message": "Lease version not found",
    "details": [
      {
        "field": "lease_version_id",
        "value": 999
      }
    ]
  }
}
```

### 404 Not Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Concession not found",
    "details": [
      {
        "field": "concession_id",
        "value": 123
      }
    ]
  }
}
```

### 405 Method Not Allowed
```json
{
  "error": {
    "code": "METHOD_NOT_ALLOWED",
    "message": "Method PATCH not allowed"
  }
}
```

## Database Schema

```sql
CREATE TABLE concession (
  concession_id SERIAL PRIMARY KEY,
  lease_version_id INT NOT NULL REFERENCES lease_version(lease_version_id),
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('TI_ALLOWANCE', 'FREE_RENT', 'OTHER')),
  value_amount DECIMAL(15,2) NOT NULL,
  value_basis VARCHAR(10) NOT NULL CHECK (value_basis IN ('TOTAL', 'PER_SF')),
  applies_daterange DATERANGE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Usage Examples

### Create TI Allowance
```bash
curl -X POST https://api.example.com/concessions \
  -H "Content-Type: application/json" \
  -d '{
    "lease_version_id": 5,
    "kind": "TI_ALLOWANCE",
    "value_amount": 50000.00,
    "value_basis": "TOTAL",
    "notes": "Office build-out allowance"
  }'
```

### Create Free Rent Period
```bash
curl -X POST https://api.example.com/concessions \
  -H "Content-Type: application/json" \
  -d '{
    "lease_version_id": 5,
    "kind": "FREE_RENT",
    "value_amount": 5000.00,
    "value_basis": "TOTAL",
    "applies_daterange": "[2024-01-01,2024-04-01)",
    "notes": "3 months free rent"
  }'
```

### List Concessions for a Lease Version
```bash
curl "https://api.example.com/concessions?lease_version_id=5"
```

### List Only Free Rent Concessions
```bash
curl "https://api.example.com/concessions?kind=FREE_RENT"
```

### Update Concession Amount
```bash
curl -X PUT https://api.example.com/concessions/1 \
  -H "Content-Type: application/json" \
  -d '{
    "value_amount": 55000.00,
    "notes": "Increased TI allowance"
  }'
```

### Delete Concession
```bash
curl -X DELETE https://api.example.com/concessions/1
```

## Requirements Mapping

This implementation satisfies the following requirements:
- **8.1**: Store Concession records with lease version reference, kind, value amount, value basis, applicable date range, and notes
- **8.2**: Support concession kinds of TI_ALLOWANCE, FREE_RENT, and OTHER
- **8.3**: Support value basis of TOTAL and PER_SF
- **8.4**: Calculate approximate months remaining for FREE_RENT concessions when applicable date range extends beyond current date
- **21.1**: Provide API endpoints for creating, reading, updating, and deleting concessions
- **21.2**: Support query parameters for filtering, sorting, and pagination
- **21.3**: Return responses in JSON format
- **21.4**: Implement proper HTTP status codes for success and error conditions
- **21.5**: Provide detailed error responses with validation messages
