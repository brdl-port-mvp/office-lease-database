# Critical Date API

Lambda function for managing lease critical dates (commencement, rent start, expiration, notice deadlines).

## Endpoints

### POST /critical-dates
Create a new critical date.

**Request Body:**
```json
{
  "lease_id": 1,
  "kind": "EXPIRATION",
  "date_value": "2025-12-31",
  "notes": "Lease expiration date"
}
```

**Response (201):**
```json
{
  "crit_id": 1,
  "lease_id": 1,
  "kind": "EXPIRATION",
  "date_value": "2025-12-31",
  "notes": "Lease expiration date",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### GET /critical-dates
List critical dates with optional filtering.

**Query Parameters:**
- `lease_id` (optional): Filter by lease ID
- `kind` (optional): Filter by kind (COMMENCEMENT, RENT_START, EXPIRATION, NOTICE, OTHER)
- `sort_by` (optional): Sort field (crit_id, kind, date_value, created_at) - default: date_value
- `sort_order` (optional): ASC or DESC - default: ASC
- `limit` (optional): Number of results per page - default: 50
- `offset` (optional): Pagination offset - default: 0

**Example:** `GET /critical-dates?lease_id=1&kind=EXPIRATION`

**Response (200):**
```json
{
  "data": [
    {
      "crit_id": 1,
      "lease_id": 1,
      "kind": "EXPIRATION",
      "date_value": "2025-12-31",
      "notes": "Lease expiration date",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 50,
    "offset": 0,
    "count": 1
  }
}
```

### GET /critical-dates/{id}
Get a single critical date by ID.

**Response (200):**
```json
{
  "crit_id": 1,
  "lease_id": 1,
  "kind": "EXPIRATION",
  "date_value": "2025-12-31",
  "notes": "Lease expiration date",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Response (404):**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Critical date not found",
    "details": [
      {
        "field": "crit_id",
        "value": "999"
      }
    ]
  }
}
```

### PUT /critical-dates/{id}
Update an existing critical date.

**Request Body:**
```json
{
  "kind": "NOTICE",
  "date_value": "2025-06-30",
  "notes": "Updated notice deadline"
}
```

**Response (200):**
```json
{
  "crit_id": 1,
  "lease_id": 1,
  "kind": "NOTICE",
  "date_value": "2025-06-30",
  "notes": "Updated notice deadline",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T11:00:00Z"
}
```

### DELETE /critical-dates/{id}
Delete a critical date.

**Response (204):** No content

**Response (404):**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Critical date not found",
    "details": [
      {
        "field": "crit_id",
        "value": "999"
      }
    ]
  }
}
```

## Validation Rules

### kind (required for create)
Must be one of:
- `COMMENCEMENT`
- `RENT_START`
- `EXPIRATION`
- `NOTICE`
- `OTHER`

### date_value (required for create)
- Must be in YYYY-MM-DD format
- Example: "2025-12-31"

### lease_id (required for create)
- Must be a positive integer
- Must reference an existing lease

### notes (optional)
- String field for additional information

## Error Responses

### 400 Bad Request
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid critical date data",
    "details": [
      {
        "field": "kind",
        "message": "Kind must be one of: COMMENCEMENT, RENT_START, EXPIRATION, NOTICE, OTHER",
        "allowed_values": ["COMMENCEMENT", "RENT_START", "EXPIRATION", "NOTICE", "OTHER"]
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
    "message": "Critical date not found",
    "details": [
      {
        "field": "crit_id",
        "value": "999"
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

## Requirements Satisfied

- **9.1**: Store Critical Date records with lease reference, kind, date value, and notes
- **9.2**: Support critical date kinds of COMMENCEMENT, RENT_START, EXPIRATION, NOTICE, and OTHER
- **9.3**: Use EXPIRATION critical date as expiration date when present
- **9.4**: Calculate expiration date from lease version effective date range when no EXPIRATION critical date exists
- **21.1**: Provide REST API endpoints for creating, reading, updating, and deleting critical dates
- **21.2**: Support query parameters for filtering by lease_id and kind
- **21.3**: Support sorting and pagination on list endpoints
- **21.4**: Return responses in JSON format
- **21.5**: Implement proper HTTP status codes and error handling
