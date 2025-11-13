# Reports API

This Lambda function handles all reporting endpoints for the Office Lease Data Platform.

## Endpoints

### 1. Expirations Report
**GET /reports/expirations**

Returns leases expiring within a specified timeframe.

**Query Parameters:**
- `months` (optional): Filter to leases expiring within N months (e.g., 6, 12)
- `state` (optional): Filter by property state
- `property_id` (optional): Filter by specific property
- `sort_by` (optional): Sort field - `expiration_date`, `months_to_expiration`, `tenant_name`, `property_name` (default: `expiration_date`)
- `sort_order` (optional): `ASC` or `DESC` (default: `ASC`)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "data": [
    {
      "lease_id": 1,
      "master_lease_num": "L-2024-001",
      "tenant_name": "Acme Corp",
      "property_name": "Downtown Tower",
      "state": "CA",
      "expiration_date": "2025-12-31",
      "months_to_expiration": 13.5
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 50,
    "offset": 0,
    "count": 45
  }
}
```

### 2. Rent Roll Report
**GET /reports/rent-roll**

Returns current rent roll showing active rent periods.

**Query Parameters:**
- `date` (optional): Target date for rent roll (YYYY-MM-DD format, default: current date)
- `property_id` (optional): Filter by specific property
- `format` (optional): Response format - `json` or `csv` (default: `json`)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response (JSON):**
```json
{
  "data": [
    {
      "lease_id": 1,
      "master_lease_num": "L-2024-001",
      "tenant_name": "Acme Corp",
      "property_name": "Downtown Tower",
      "period_start": "2024-01-01",
      "period_end": "2024-12-31",
      "basis": "MONTH",
      "amount": 5000.00,
      "monthly_equiv": 5000.00,
      "annualized_equiv": 60000.00
    }
  ],
  "pagination": {
    "total": 120,
    "limit": 50,
    "offset": 0,
    "count": 50
  }
}
```

**Response (CSV):**
```csv
lease_id,master_lease_num,tenant_name,property_name,period_start,period_end,basis,amount,monthly_equiv,annualized_equiv
1,L-2024-001,Acme Corp,Downtown Tower,2024-01-01,2024-12-31,MONTH,5000.00,5000.00,60000.00
```

### 3. Options Status Report
**GET /reports/options**

Returns lease options with notice window status.

**Query Parameters:**
- `type` (optional): Filter by option type - `RENEWAL`, `TERMINATION`, `EXPANSION`, `ROFR`, `OTHER`
- `window_status` (optional): Filter by window status - `open` or `closed`
- `exercised` (optional): Filter by exercised status - `true` or `false`
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "data": [
    {
      "lease_id": 1,
      "master_lease_num": "L-2024-001",
      "tenant_name": "Acme Corp",
      "property_name": "Downtown Tower",
      "option_type": "RENEWAL",
      "window_start": "2025-01-01",
      "window_end": "2025-03-31",
      "notice_window_open": true,
      "terms": "5-year renewal at 3% increase",
      "exercised": false,
      "exercised_date": null
    }
  ],
  "pagination": {
    "total": 23,
    "limit": 50,
    "offset": 0,
    "count": 23
  }
}
```

### 4. Free Rent Status Report
**GET /reports/free-rent**

Returns active free rent periods with months remaining.

**Query Parameters:**
- `active_only` (optional): Show only active free rent periods (default: `true`)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "data": [
    {
      "lease_id": 1,
      "master_lease_num": "L-2024-001",
      "tenant_name": "Acme Corp",
      "property_name": "Downtown Tower",
      "free_rent_start": "2024-01-01",
      "free_rent_end": "2024-06-30",
      "value_amount": 30000.00,
      "value_basis": "TOTAL",
      "approx_months_remaining": 2.5
    }
  ],
  "pagination": {
    "total": 8,
    "limit": 50,
    "offset": 0,
    "count": 8
  }
}
```

### 5. TI Allowances Summary Report
**GET /reports/ti-allowances**

Returns aggregated tenant improvement allowances by lease.

**Query Parameters:**
- `lease_id` (optional): Filter by specific lease
- `property_id` (optional): Filter by specific property
- `tenant_name` (optional): Filter by tenant name (partial match)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "data": [
    {
      "lease_id": 1,
      "master_lease_num": "L-2024-001",
      "tenant_name": "Acme Corp",
      "property_name": "Downtown Tower",
      "total_ti_amount": 150000.00
    }
  ],
  "pagination": {
    "total": 67,
    "limit": 50,
    "offset": 0,
    "count": 50
  }
}
```

### 6. Critical Dates Report
**GET /reports/critical-dates**

Returns upcoming critical dates within a specified timeframe.

**Query Parameters:**
- `days_ahead` (optional): Lookahead period in days (default: 180)
- `kind` (optional): Filter by date kind - `COMMENCEMENT`, `RENT_START`, `EXPIRATION`, `NOTICE`, `OTHER`
- `lease_id` (optional): Filter by specific lease
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "data": [
    {
      "lease_id": 1,
      "master_lease_num": "L-2024-001",
      "tenant_name": "Acme Corp",
      "property_name": "Downtown Tower",
      "kind": "EXPIRATION",
      "date_value": "2025-12-31"
    }
  ],
  "pagination": {
    "total": 34,
    "limit": 50,
    "offset": 0,
    "count": 34
  }
}
```

### 7. Amendment History Report
**GET /reports/amendments**

Returns all lease versions showing amendment history.

**Query Parameters:**
- `lease_id` (optional): Filter by specific lease (recommended)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "data": [
    {
      "lease_id": 1,
      "master_lease_num": "L-2024-001",
      "lease_version_id": 1,
      "version_num": 0,
      "effective_start": "2024-01-01",
      "effective_end": "2024-12-31",
      "is_current": false
    },
    {
      "lease_id": 1,
      "master_lease_num": "L-2024-001",
      "lease_version_id": 2,
      "version_num": 1,
      "effective_start": "2025-01-01",
      "effective_end": "2029-12-31",
      "is_current": true
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

### 8. OpEx Summary Report
**GET /reports/opex-summary**

Returns current operating expense pass-through configurations.

**Query Parameters:**
- `property_id` (optional): Filter by specific property
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "data": [
    {
      "lease_id": 1,
      "master_lease_num": "L-2024-001",
      "property_name": "Downtown Tower",
      "method": "BASE_YEAR",
      "stop_amount": 5.50,
      "gross_up_pct": 95.00
    }
  ],
  "pagination": {
    "total": 89,
    "limit": 50,
    "offset": 0,
    "count": 50
  }
}
```

## Error Responses

All endpoints return standardized error responses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid date format",
    "details": [
      {
        "field": "date",
        "message": "Date must be in YYYY-MM-DD format"
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

## Database Views

The reports API queries the following database views:

- `vw_expirations` - Lease expirations with calculated months remaining
- `vw_rent_roll_current` - Current rent periods with monthly/annual equivalents
- `vw_options_status` - Options with notice window status
- `vw_free_rent_status` - Active free rent periods
- `vw_ti_allowance_summary` - Aggregated TI allowances
- `vw_critical_dates_upcoming` - Critical dates within 180 days
- `vw_amendment_history` - All lease versions
- `vw_opex_summary` - Current OpEx configurations

## Testing

Example test queries:

```bash
# Get leases expiring in next 6 months
curl "https://api.example.com/reports/expirations?months=6"

# Get rent roll for specific property
curl "https://api.example.com/reports/rent-roll?property_id=1"

# Get open renewal options
curl "https://api.example.com/reports/options?type=RENEWAL&window_status=open"

# Get active free rent periods
curl "https://api.example.com/reports/free-rent?active_only=true"

# Get TI allowances for specific tenant
curl "https://api.example.com/reports/ti-allowances?tenant_name=Acme"

# Get critical dates in next 90 days
curl "https://api.example.com/reports/critical-dates?days_ahead=90"

# Get amendment history for lease
curl "https://api.example.com/reports/amendments?lease_id=1"

# Get OpEx summary for property
curl "https://api.example.com/reports/opex-summary?property_id=1"

# Export rent roll as CSV
curl "https://api.example.com/reports/rent-roll?format=csv" > rent-roll.csv
```

## Performance Considerations

- All reports use database views for optimized query performance
- Pagination is recommended for large result sets
- CSV export is available for rent roll report
- Views are indexed on commonly filtered columns
- Query execution time target: < 2 seconds for most reports
