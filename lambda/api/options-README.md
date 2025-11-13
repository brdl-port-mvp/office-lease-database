# Options API

Lambda function for managing lease options (renewal, termination, expansion, ROFR).

## Endpoints

### GET /options
List options with filtering and pagination.

**Query Parameters:**
- `lease_version_id` (optional): Filter by lease version ID
- `option_type` (optional): Filter by option type (RENEWAL, TERMINATION, EXPANSION, ROFR, OTHER)
- `window_status` (optional): Filter by notice window status ('open' or 'closed')
- `exercised` (optional): Filter by exercised status (true/false)
- `sort_by` (optional): Sort field (option_id, option_type, window_daterange, exercised, created_at)
- `sort_order` (optional): Sort order (ASC or DESC)
- `limit` (optional): Number of results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "data": [
    {
      "option_id": 1,
      "lease_version_id": 5,
      "option_type": "RENEWAL",
      "window_daterange": "[2024-06-01,2024-12-31)",
      "terms": "5-year renewal at 3% increase",
      "exercised": false,
      "exercised_date": null,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "notice_window_open": true
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

### GET /options/{id}
Get a single option by ID with notice window status.

**Response:**
```json
{
  "option_id": 1,
  "lease_version_id": 5,
  "option_type": "RENEWAL",
  "window_daterange": "[2024-06-01,2024-12-31)",
  "terms": "5-year renewal at 3% increase",
  "exercised": false,
  "exercised_date": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "notice_window_open": true
}
```

### POST /options
Create a new option.

**Request Body:**
```json
{
  "lease_version_id": 5,
  "option_type": "RENEWAL",
  "window_daterange": "[2024-06-01,2024-12-31)",
  "terms": "5-year renewal at 3% increase",
  "exercised": false,
  "exercised_date": null
}
```

**Required Fields:**
- `lease_version_id`: Integer, must reference existing lease version
- `option_type`: String, one of: RENEWAL, TERMINATION, EXPANSION, ROFR, OTHER
- `window_daterange`: String, PostgreSQL daterange format (e.g., "[2024-01-01,2025-01-01)")

**Optional Fields:**
- `terms`: String, description of option terms
- `exercised`: Boolean, default false
- `exercised_date`: String, date in YYYY-MM-DD format

**Response:** 201 Created with option object

### PUT /options/{id}
Update an existing option.

**Request Body:**
```json
{
  "option_type": "RENEWAL",
  "window_daterange": "[2024-06-01,2025-01-31)",
  "terms": "Updated terms",
  "exercised": false,
  "exercised_date": null
}
```

**Response:** 200 OK with updated option object

### PUT /options/{id}/exercise
Mark an option as exercised.

**Request Body:**
```json
{
  "exercised_date": "2024-11-01"
}
```

**Optional Fields:**
- `exercised_date`: String, date in YYYY-MM-DD format (defaults to current date if not provided)

**Response:** 200 OK with updated option object

**Notes:**
- Sets `exercised` to TRUE
- Sets `exercised_date` to provided date or current date
- Returns 409 Conflict if option is already exercised

### DELETE /options/{id}
Delete an option.

**Response:** 204 No Content

## Validation Rules

### Option Type
Must be one of:
- RENEWAL
- TERMINATION
- EXPANSION
- ROFR
- OTHER

### Window Date Range
- Must be in PostgreSQL daterange format: `[start_date,end_date)`
- Example: `[2024-01-01,2025-01-01)` (inclusive start, exclusive end)
- Example: `(2024-01-01,2025-01-01]` (exclusive start, inclusive end)

### Notice Window Open Calculation
The `notice_window_open` flag is calculated dynamically:
- TRUE when current date falls within the `window_daterange`
- FALSE otherwise
- Uses PostgreSQL's `@>` operator for date range containment

## Error Responses

### 400 Bad Request - Validation Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid option data",
    "details": [
      {
        "field": "option_type",
        "message": "Option type must be one of: RENEWAL, TERMINATION, EXPANSION, ROFR, OTHER",
        "allowed_values": ["RENEWAL", "TERMINATION", "EXPANSION", "ROFR", "OTHER"]
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
    "message": "Option not found",
    "details": [
      {
        "field": "option_id",
        "value": 123
      }
    ]
  }
}
```

### 409 Conflict - Already Exercised
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Option has already been exercised",
    "details": [
      {
        "field": "option_id",
        "value": 1
      }
    ]
  }
}
```

## Example Usage

### Create a renewal option with notice window
```bash
curl -X POST https://api.example.com/options \
  -H "Content-Type: application/json" \
  -d '{
    "lease_version_id": 5,
    "option_type": "RENEWAL",
    "window_daterange": "[2024-06-01,2024-12-31)",
    "terms": "5-year renewal at 3% annual increase"
  }'
```

### List options with open notice windows
```bash
curl "https://api.example.com/options?window_status=open"
```

### Exercise an option
```bash
curl -X PUT https://api.example.com/options/1/exercise \
  -H "Content-Type: application/json" \
  -d '{
    "exercised_date": "2024-11-01"
  }'
```

### Filter by lease version and option type
```bash
curl "https://api.example.com/options?lease_version_id=5&option_type=RENEWAL"
```

## Requirements Mapping

This implementation satisfies the following requirements:

- **7.1**: Store Option records with lease version reference, option type, notice window date range, terms, exercised flag, and exercised date
- **7.2**: Support option types of RENEWAL, TERMINATION, EXPANSION, ROFR, and OTHER
- **7.3**: Calculate notice_window_open flag when current date falls within the notice window date range
- **7.4**: Default exercised flag to FALSE
- **21.1**: Provide REST API endpoints for creating, reading, updating, and deleting options
- **21.2**: Support query parameters for filtering, sorting, and pagination
- **21.3**: Return responses in JSON format
- **21.4**: Implement proper HTTP status codes
- **21.5**: Implement proper error handling with detailed error messages
