# API Examples

## Create Property

```bash
curl -X POST https://your-api-endpoint/properties \
  -H "Content-Type: application/json" \
  -d '{
    "property_name": "Downtown Office Tower",
    "address": "123 Main Street",
    "city": "New York",
    "state": "NY",
    "zip_code": "10001",
    "total_square_feet": 50000,
    "building_class": "A"
  }'
```

## Create Lease

```bash
curl -X POST https://your-api-endpoint/leases \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": 1,
    "tenant_name": "Tech Corp Inc",
    "lease_start_date": "2024-01-01",
    "lease_end_date": "2026-12-31",
    "lease_term_months": 36,
    "square_feet": 5000,
    "monthly_rent": 25000,
    "annual_rent": 300000,
    "security_deposit": 50000,
    "renewal_option": true
  }'
```

## Get All Leases

```bash
curl https://your-api-endpoint/leases
```

## Get Leases by Status

```bash
curl https://your-api-endpoint/leases?status=active
```

## Get Single Lease

```bash
curl https://your-api-endpoint/leases/1
```

## Update Lease

```bash
curl -X PUT https://your-api-endpoint/leases/1 \
  -H "Content-Type: application/json" \
  -d '{
    "monthly_rent": 27000,
    "annual_rent": 324000
  }'
```

## Delete Lease

```bash
curl -X DELETE https://your-api-endpoint/leases/1
```

## Rent Schedule Endpoints

### Create Rent Schedule

```bash
curl -X POST https://your-api-endpoint/rent-schedules \
  -H "Content-Type: application/json" \
  -d '{
    "lease_version_id": 1,
    "period_daterange": "[2024-01-01,2025-01-01)",
    "amount": 5000.00,
    "basis": "MONTH"
  }'
```

### Get All Rent Schedules for a Lease Version

```bash
curl "https://your-api-endpoint/rent-schedules?lease_version_id=1"
```

### Get Single Rent Schedule

```bash
curl https://your-api-endpoint/rent-schedules/1
```

### Update Rent Schedule

```bash
curl -X PUT https://your-api-endpoint/rent-schedules/1 \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5500.00,
    "basis": "MONTH"
  }'
```

### Delete Rent Schedule

```bash
curl -X DELETE https://your-api-endpoint/rent-schedules/1
```

### Response Example

```json
{
  "rent_id": 1,
  "lease_version_id": 1,
  "period_daterange": "[2024-01-01,2025-01-01)",
  "amount": "5000.00",
  "basis": "MONTH",
  "monthly_equiv": "5000.00",
  "annualized_equiv": "60000.00",
  "created_at": "2024-11-11T10:00:00.000Z",
  "updated_at": "2024-11-11T10:00:00.000Z"
}
```

### List Response Example

```json
{
  "data": [
    {
      "rent_id": 1,
      "lease_version_id": 1,
      "period_daterange": "[2024-01-01,2025-01-01)",
      "amount": "5000.00",
      "basis": "MONTH",
      "monthly_equiv": "5000.00",
      "annualized_equiv": "60000.00",
      "created_at": "2024-11-11T10:00:00.000Z",
      "updated_at": "2024-11-11T10:00:00.000Z"
    },
    {
      "rent_id": 2,
      "lease_version_id": 1,
      "period_daterange": "[2025-01-01,2026-01-01)",
      "amount": "5500.00",
      "basis": "MONTH",
      "monthly_equiv": "5500.00",
      "annualized_equiv": "66000.00",
      "created_at": "2024-11-11T10:05:00.000Z",
      "updated_at": "2024-11-11T10:05:00.000Z"
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

### Error Response - Overlapping Date Range

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Period date range overlaps with existing rent schedule",
    "details": [
      {
        "field": "period_daterange",
        "value": "[2024-06-01,2025-06-01)",
        "conflicting_rent_id": 1,
        "conflicting_period": "[2024-01-01,2025-01-01)"
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Invalid Basis

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid rent schedule data",
    "details": [
      {
        "field": "basis",
        "message": "Basis must be one of: MONTH, YEAR",
        "allowed_values": ["MONTH", "YEAR"]
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

## OpEx Pass-Through Endpoints

### Create OpEx Pass-Through

```bash
curl -X POST https://your-api-endpoint/opex-pass-throughs \
  -H "Content-Type: application/json" \
  -d '{
    "lease_version_id": 1,
    "method": "BASE_YEAR",
    "stop_amount": 15000.00,
    "gross_up_pct": 95.0,
    "notes": "Base year 2024 with 95% occupancy gross-up"
  }'
```

### Get All OpEx Pass-Throughs for a Lease Version

```bash
curl "https://your-api-endpoint/opex-pass-throughs?lease_version_id=1"
```

### Get OpEx Pass-Throughs by Method

```bash
curl "https://your-api-endpoint/opex-pass-throughs?method=BASE_YEAR"
```

### Get Single OpEx Pass-Through

```bash
curl https://your-api-endpoint/opex-pass-throughs/1
```

### Update OpEx Pass-Through

```bash
curl -X PUT https://your-api-endpoint/opex-pass-throughs/1 \
  -H "Content-Type: application/json" \
  -d '{
    "method": "EXPENSE_STOP",
    "stop_amount": 18000.00,
    "notes": "Updated to expense stop method for 2025"
  }'
```

### Delete OpEx Pass-Through

```bash
curl -X DELETE https://your-api-endpoint/opex-pass-throughs/1
```

### Response Example

```json
{
  "opex_id": 1,
  "lease_version_id": 1,
  "method": "BASE_YEAR",
  "stop_amount": "15000.00",
  "gross_up_pct": "95.00",
  "notes": "Base year 2024 with 95% occupancy gross-up",
  "created_at": "2024-11-11T10:00:00.000Z",
  "updated_at": "2024-11-11T10:00:00.000Z"
}
```

### List Response Example

```json
{
  "data": [
    {
      "opex_id": 1,
      "lease_version_id": 1,
      "method": "BASE_YEAR",
      "stop_amount": "15000.00",
      "gross_up_pct": "95.00",
      "notes": "Base year 2024 with 95% occupancy gross-up",
      "created_at": "2024-11-11T10:00:00.000Z",
      "updated_at": "2024-11-11T10:00:00.000Z"
    },
    {
      "opex_id": 2,
      "lease_version_id": 2,
      "method": "NNN",
      "stop_amount": null,
      "gross_up_pct": null,
      "notes": "Triple net lease - tenant pays all expenses",
      "created_at": "2024-11-11T10:05:00.000Z",
      "updated_at": "2024-11-11T10:05:00.000Z"
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

### Error Response - Invalid Method

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid OpEx pass-through data",
    "details": [
      {
        "field": "method",
        "message": "Method must be one of: BASE_YEAR, EXPENSE_STOP, NNN, OTHER",
        "allowed_values": ["BASE_YEAR", "EXPENSE_STOP", "NNN", "OTHER"]
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Invalid Lease Version

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
    ],
    "request_id": "abc-123-def"
  }
}
```

## Option Endpoints

### Create Option

```bash
curl -X POST https://your-api-endpoint/options \
  -H "Content-Type: application/json" \
  -d '{
    "lease_version_id": 1,
    "option_type": "RENEWAL",
    "window_daterange": "[2024-06-01,2024-12-31)",
    "terms": "5-year renewal at 3% annual increase",
    "exercised": false
  }'
```

### Get All Options for a Lease Version

```bash
curl "https://your-api-endpoint/options?lease_version_id=1"
```

### Get Options with Open Notice Windows

```bash
curl "https://your-api-endpoint/options?window_status=open"
```

### Get Options by Type

```bash
curl "https://your-api-endpoint/options?option_type=RENEWAL"
```

### Get Exercised Options

```bash
curl "https://your-api-endpoint/options?exercised=true"
```

### Get Single Option

```bash
curl https://your-api-endpoint/options/1
```

### Update Option

```bash
curl -X PUT https://your-api-endpoint/options/1 \
  -H "Content-Type: application/json" \
  -d '{
    "window_daterange": "[2024-06-01,2025-01-31)",
    "terms": "Updated: 5-year renewal at 3.5% annual increase"
  }'
```

### Exercise Option

```bash
curl -X PUT https://your-api-endpoint/options/1/exercise \
  -H "Content-Type: application/json" \
  -d '{
    "exercised_date": "2024-11-01"
  }'
```

### Exercise Option (using current date)

```bash
curl -X PUT https://your-api-endpoint/options/1/exercise \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Delete Option

```bash
curl -X DELETE https://your-api-endpoint/options/1
```

### Response Example

```json
{
  "option_id": 1,
  "lease_version_id": 1,
  "option_type": "RENEWAL",
  "window_daterange": "[2024-06-01,2024-12-31)",
  "terms": "5-year renewal at 3% annual increase",
  "exercised": false,
  "exercised_date": null,
  "created_at": "2024-11-11T10:00:00.000Z",
  "updated_at": "2024-11-11T10:00:00.000Z",
  "notice_window_open": true
}
```

### List Response Example

```json
{
  "data": [
    {
      "option_id": 1,
      "lease_version_id": 1,
      "option_type": "RENEWAL",
      "window_daterange": "[2024-06-01,2024-12-31)",
      "terms": "5-year renewal at 3% annual increase",
      "exercised": false,
      "exercised_date": null,
      "created_at": "2024-11-11T10:00:00.000Z",
      "updated_at": "2024-11-11T10:00:00.000Z",
      "notice_window_open": true
    },
    {
      "option_id": 2,
      "lease_version_id": 1,
      "option_type": "TERMINATION",
      "window_daterange": "[2025-01-01,2025-03-31)",
      "terms": "Early termination with 6 months notice and penalty",
      "exercised": false,
      "exercised_date": null,
      "created_at": "2024-11-11T10:05:00.000Z",
      "updated_at": "2024-11-11T10:05:00.000Z",
      "notice_window_open": false
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

### Error Response - Invalid Option Type

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
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Already Exercised

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
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Invalid Date Range Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid option data",
    "details": [
      {
        "field": "window_daterange",
        "message": "Window date range must be in PostgreSQL daterange format (e.g., \"[2024-01-01,2025-01-01)\")"
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

## Concession Endpoints

### Create TI Allowance Concession

```bash
curl -X POST https://your-api-endpoint/concessions \
  -H "Content-Type: application/json" \
  -d '{
    "lease_version_id": 1,
    "kind": "TI_ALLOWANCE",
    "value_amount": 50000.00,
    "value_basis": "TOTAL",
    "applies_daterange": "[2024-01-01,2024-12-31)",
    "notes": "Tenant improvement allowance for office build-out"
  }'
```

### Create Free Rent Concession

```bash
curl -X POST https://your-api-endpoint/concessions \
  -H "Content-Type: application/json" \
  -d '{
    "lease_version_id": 1,
    "kind": "FREE_RENT",
    "value_amount": 15000.00,
    "value_basis": "TOTAL",
    "applies_daterange": "[2024-01-01,2024-04-01)",
    "notes": "3 months free rent"
  }'
```

### Create Per-SF TI Allowance

```bash
curl -X POST https://your-api-endpoint/concessions \
  -H "Content-Type: application/json" \
  -d '{
    "lease_version_id": 1,
    "kind": "TI_ALLOWANCE",
    "value_amount": 25.00,
    "value_basis": "PER_SF",
    "notes": "$25 per square foot TI allowance"
  }'
```

### Get All Concessions for a Lease Version

```bash
curl "https://your-api-endpoint/concessions?lease_version_id=1"
```

### Get Concessions by Kind

```bash
curl "https://your-api-endpoint/concessions?kind=FREE_RENT"
```

### Get Concessions by Value Basis

```bash
curl "https://your-api-endpoint/concessions?value_basis=PER_SF"
```

### Get Single Concession

```bash
curl https://your-api-endpoint/concessions/1
```

### Update Concession

```bash
curl -X PUT https://your-api-endpoint/concessions/1 \
  -H "Content-Type: application/json" \
  -d '{
    "value_amount": 55000.00,
    "notes": "Increased TI allowance to $55,000"
  }'
```

### Delete Concession

```bash
curl -X DELETE https://your-api-endpoint/concessions/1
```

### Response Example - TI Allowance

```json
{
  "concession_id": 1,
  "lease_version_id": 1,
  "kind": "TI_ALLOWANCE",
  "value_amount": "50000.00",
  "value_basis": "TOTAL",
  "applies_daterange": "[2024-01-01,2024-12-31)",
  "notes": "Tenant improvement allowance for office build-out",
  "created_at": "2024-11-11T10:00:00.000Z",
  "updated_at": "2024-11-11T10:00:00.000Z",
  "months_remaining": null
}
```

### Response Example - Free Rent with Months Remaining

```json
{
  "concession_id": 2,
  "lease_version_id": 1,
  "kind": "FREE_RENT",
  "value_amount": "15000.00",
  "value_basis": "TOTAL",
  "applies_daterange": "[2024-01-01,2024-04-01)",
  "notes": "3 months free rent",
  "created_at": "2024-11-11T10:00:00.000Z",
  "updated_at": "2024-11-11T10:00:00.000Z",
  "months_remaining": 2.5
}
```

### List Response Example

```json
{
  "data": [
    {
      "concession_id": 1,
      "lease_version_id": 1,
      "kind": "TI_ALLOWANCE",
      "value_amount": "50000.00",
      "value_basis": "TOTAL",
      "applies_daterange": "[2024-01-01,2024-12-31)",
      "notes": "Tenant improvement allowance for office build-out",
      "created_at": "2024-11-11T10:00:00.000Z",
      "updated_at": "2024-11-11T10:00:00.000Z",
      "months_remaining": null
    },
    {
      "concession_id": 2,
      "lease_version_id": 1,
      "kind": "FREE_RENT",
      "value_amount": "15000.00",
      "value_basis": "TOTAL",
      "applies_daterange": "[2024-01-01,2024-04-01)",
      "notes": "3 months free rent",
      "created_at": "2024-11-11T10:00:00.000Z",
      "updated_at": "2024-11-11T10:00:00.000Z",
      "months_remaining": 2.5
    },
    {
      "concession_id": 3,
      "lease_version_id": 1,
      "kind": "TI_ALLOWANCE",
      "value_amount": "25.00",
      "value_basis": "PER_SF",
      "applies_daterange": null,
      "notes": "$25 per square foot TI allowance",
      "created_at": "2024-11-11T10:10:00.000Z",
      "updated_at": "2024-11-11T10:10:00.000Z",
      "months_remaining": null
    }
  ],
  "pagination": {
    "total": 3,
    "limit": 50,
    "offset": 0,
    "count": 3
  }
}
```

### Error Response - Invalid Kind

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
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Invalid Value Basis

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid concession data",
    "details": [
      {
        "field": "value_basis",
        "message": "Value basis must be one of: TOTAL, PER_SF",
        "allowed_values": ["TOTAL", "PER_SF"]
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Missing Required Fields

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid concession data",
    "details": [
      {
        "field": "value_amount",
        "message": "Value amount is required"
      },
      {
        "field": "value_basis",
        "message": "Value basis is required"
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Invalid Lease Version

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
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Invalid Date Range Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid concession data",
    "details": [
      {
        "field": "applies_daterange",
        "message": "Applies date range must be in PostgreSQL daterange format (e.g., \"[2024-01-01,2025-01-01)\")"
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Months Remaining Calculation

The `months_remaining` field is automatically calculated for FREE_RENT concessions:
- Only calculated when `kind` = 'FREE_RENT'
- Only calculated when `applies_daterange` is not null
- Only calculated when the upper bound of the date range is in the future
- Formula: `(upper_bound_of_daterange - current_date) / 30 days`
- Returns null for TI_ALLOWANCE, OTHER, or expired free rent periods

Example scenarios:
- Free rent ending in 75 days: `months_remaining` = 2.5
- Free rent ending in 30 days: `months_remaining` = 1.0
- Free rent already ended: `months_remaining` = null
- TI Allowance: `months_remaining` = null

## Critical Date Endpoints

### Create Critical Date

```bash
curl -X POST https://your-api-endpoint/critical-dates \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "kind": "EXPIRATION",
    "date_value": "2025-12-31",
    "notes": "Lease expiration date"
  }'
```

### Create Commencement Date

```bash
curl -X POST https://your-api-endpoint/critical-dates \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "kind": "COMMENCEMENT",
    "date_value": "2024-01-01",
    "notes": "Lease commencement date"
  }'
```

### Create Notice Deadline

```bash
curl -X POST https://your-api-endpoint/critical-dates \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "kind": "NOTICE",
    "date_value": "2025-06-30",
    "notes": "Renewal notice deadline - 6 months before expiration"
  }'
```

### Get All Critical Dates for a Lease

```bash
curl "https://your-api-endpoint/critical-dates?lease_id=1"
```

### Get Critical Dates by Kind

```bash
curl "https://your-api-endpoint/critical-dates?kind=EXPIRATION"
```

### Get Critical Dates Sorted by Date

```bash
curl "https://your-api-endpoint/critical-dates?lease_id=1&sort_by=date_value&sort_order=ASC"
```

### Get Single Critical Date

```bash
curl https://your-api-endpoint/critical-dates/1
```

### Update Critical Date

```bash
curl -X PUT https://your-api-endpoint/critical-dates/1 \
  -H "Content-Type: application/json" \
  -d '{
    "date_value": "2026-01-31",
    "notes": "Updated expiration date after amendment"
  }'
```

### Delete Critical Date

```bash
curl -X DELETE https://your-api-endpoint/critical-dates/1
```

### Response Example

```json
{
  "crit_id": 1,
  "lease_id": 1,
  "kind": "EXPIRATION",
  "date_value": "2025-12-31",
  "notes": "Lease expiration date",
  "created_at": "2024-11-11T10:00:00.000Z",
  "updated_at": "2024-11-11T10:00:00.000Z"
}
```

### List Response Example

```json
{
  "data": [
    {
      "crit_id": 1,
      "lease_id": 1,
      "kind": "COMMENCEMENT",
      "date_value": "2024-01-01",
      "notes": "Lease commencement date",
      "created_at": "2024-11-11T10:00:00.000Z",
      "updated_at": "2024-11-11T10:00:00.000Z"
    },
    {
      "crit_id": 2,
      "lease_id": 1,
      "kind": "RENT_START",
      "date_value": "2024-04-01",
      "notes": "Rent start date after 3 months free rent",
      "created_at": "2024-11-11T10:05:00.000Z",
      "updated_at": "2024-11-11T10:05:00.000Z"
    },
    {
      "crit_id": 3,
      "lease_id": 1,
      "kind": "NOTICE",
      "date_value": "2025-06-30",
      "notes": "Renewal notice deadline - 6 months before expiration",
      "created_at": "2024-11-11T10:10:00.000Z",
      "updated_at": "2024-11-11T10:10:00.000Z"
    },
    {
      "crit_id": 4,
      "lease_id": 1,
      "kind": "EXPIRATION",
      "date_value": "2025-12-31",
      "notes": "Lease expiration date",
      "created_at": "2024-11-11T10:15:00.000Z",
      "updated_at": "2024-11-11T10:15:00.000Z"
    }
  ],
  "pagination": {
    "total": 4,
    "limit": 50,
    "offset": 0,
    "count": 4
  }
}
```

### Error Response - Invalid Kind

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
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Invalid Date Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid critical date data",
    "details": [
      {
        "field": "date_value",
        "message": "Date value must be in YYYY-MM-DD format"
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Invalid Lease Reference

```json
{
  "error": {
    "code": "INVALID_REFERENCE",
    "message": "Lease not found",
    "details": [
      {
        "field": "lease_id",
        "value": 999
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Missing Required Fields

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid critical date data",
    "details": [
      {
        "field": "lease_id",
        "message": "Lease ID is required"
      },
      {
        "field": "kind",
        "message": "Kind is required"
      },
      {
        "field": "date_value",
        "message": "Date value is required"
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Critical Date Kinds

The system supports the following critical date kinds:
- **COMMENCEMENT**: Lease commencement date
- **RENT_START**: Date when rent payments begin (may differ from commencement if free rent applies)
- **EXPIRATION**: Lease expiration date (used in expiration reports)
- **NOTICE**: Important notice deadlines (renewal, termination, etc.)
- **OTHER**: Any other important dates

### Expiration Date Resolution

The system uses the following logic to determine a lease's expiration date:
1. If a critical date with `kind` = 'EXPIRATION' exists, use that date
2. Otherwise, calculate from the current lease version's effective date range (upper bound - 1 day)

This allows flexibility in tracking expiration dates while maintaining data integrity.

## Document Link Endpoints

### Create Document Link with URL

```bash
curl -X POST https://your-api-endpoint/doc-links \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "label": "Original Lease Agreement",
    "external_ref": "https://docs.example.com/lease-001.pdf"
  }'
```

### Create Document Link with ECM Identifier

```bash
curl -X POST https://your-api-endpoint/doc-links \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "label": "Amendment 1",
    "external_ref": "ECM-2024-001"
  }'
```

### Create Document Link with S3 URL

```bash
curl -X POST https://your-api-endpoint/doc-links \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "label": "Signed Lease Document",
    "external_ref": "https://s3.amazonaws.com/lease-docs/2024/lease-001.pdf"
  }'
```

### Get All Document Links for a Lease

```bash
curl "https://your-api-endpoint/doc-links?lease_id=1"
```

### Get Document Links Sorted by Label

```bash
curl "https://your-api-endpoint/doc-links?lease_id=1&sort_by=label&sort_order=ASC"
```

### Get Single Document Link

```bash
curl https://your-api-endpoint/doc-links/1
```

### Update Document Link

```bash
curl -X PUT https://your-api-endpoint/doc-links/1 \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Updated Lease Agreement",
    "external_ref": "https://docs.example.com/updated-lease-001.pdf"
  }'
```

### Delete Document Link

```bash
curl -X DELETE https://your-api-endpoint/doc-links/1
```

### Response Example - URL Reference

```json
{
  "doc_id": 1,
  "lease_id": 1,
  "label": "Original Lease Agreement",
  "external_ref": "https://docs.example.com/lease-001.pdf",
  "created_at": "2024-11-11T10:00:00.000Z",
  "updated_at": "2024-11-11T10:00:00.000Z"
}
```

### Response Example - ECM Reference

```json
{
  "doc_id": 2,
  "lease_id": 1,
  "label": "Amendment 1",
  "external_ref": "ECM-2024-001",
  "created_at": "2024-11-11T10:05:00.000Z",
  "updated_at": "2024-11-11T10:05:00.000Z"
}
```

### List Response Example

```json
{
  "data": [
    {
      "doc_id": 1,
      "lease_id": 1,
      "label": "Original Lease Agreement",
      "external_ref": "https://docs.example.com/lease-001.pdf",
      "created_at": "2024-11-11T10:00:00.000Z",
      "updated_at": "2024-11-11T10:00:00.000Z"
    },
    {
      "doc_id": 2,
      "lease_id": 1,
      "label": "Amendment 1",
      "external_ref": "ECM-2024-001",
      "created_at": "2024-11-11T10:05:00.000Z",
      "updated_at": "2024-11-11T10:05:00.000Z"
    },
    {
      "doc_id": 3,
      "lease_id": 1,
      "label": "Tenant Estoppel Certificate",
      "external_ref": "DOC_ESTOPPEL_2024_Q4",
      "created_at": "2024-11-11T10:10:00.000Z",
      "updated_at": "2024-11-11T10:10:00.000Z"
    }
  ],
  "pagination": {
    "total": 3,
    "limit": 50,
    "offset": 0,
    "count": 3
  }
}
```

### Error Response - Invalid External Reference Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid document link data",
    "details": [
      {
        "field": "external_ref",
        "message": "External reference must be a valid URL (http:// or https://) or ECM identifier (alphanumeric with hyphens/underscores)",
        "examples": [
          "https://example.com/doc.pdf",
          "ECM-12345",
          "DOC_ABC_123"
        ]
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Invalid Lease Reference

```json
{
  "error": {
    "code": "INVALID_REFERENCE",
    "message": "Lease not found",
    "details": [
      {
        "field": "lease_id",
        "value": 999
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Missing Required Fields

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid document link data",
    "details": [
      {
        "field": "lease_id",
        "message": "Lease ID is required"
      },
      {
        "field": "label",
        "message": "Label is required"
      },
      {
        "field": "external_ref",
        "message": "External reference is required"
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### Error Response - Empty Label

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid document link data",
    "details": [
      {
        "field": "label",
        "message": "Label cannot be empty"
      }
    ],
    "request_id": "abc-123-def"
  }
}
```

### External Reference Format

The `external_ref` field accepts two formats:

#### 1. URL Format
Valid HTTP or HTTPS URLs pointing to documents:
```
https://docs.example.com/lease-001.pdf
http://internal-docs.company.com/files/lease.docx
https://s3.amazonaws.com/bucket/documents/lease-123.pdf
```

#### 2. ECM Identifier Format
Alphanumeric identifiers for document management systems:
```
ECM-12345
DOC_ABC_123
doc.2024.001
LEASE-2024-Q1-001
```

**ECM Identifier Rules:**
- Must start with an alphanumeric character
- Can contain letters, numbers, hyphens (-), underscores (_), and periods (.)
- Maximum length: 255 characters
- Examples: `ECM-12345`, `DOC_ABC_123`, `lease.2024.001`

### Use Cases

**Document Management System Integration:**
```bash
# Link to SharePoint document
curl -X POST https://your-api-endpoint/doc-links \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "label": "Executed Lease",
    "external_ref": "https://company.sharepoint.com/sites/RealEstate/Shared%20Documents/Lease-001.pdf"
  }'
```

**ECM System Integration:**
```bash
# Link to enterprise content management system
curl -X POST https://your-api-endpoint/doc-links \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "label": "Original Lease",
    "external_ref": "DOCMGMT-2024-RE-001"
  }'
```

**Multiple Documents per Lease:**
```bash
# Link multiple documents to the same lease
curl -X POST https://your-api-endpoint/doc-links \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "label": "Original Lease Agreement",
    "external_ref": "https://docs.example.com/lease-001.pdf"
  }'

curl -X POST https://your-api-endpoint/doc-links \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "label": "Amendment 1",
    "external_ref": "https://docs.example.com/amendment-001-01.pdf"
  }'

curl -X POST https://your-api-endpoint/doc-links \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "label": "Amendment 2",
    "external_ref": "https://docs.example.com/amendment-001-02.pdf"
  }'
```

### Document Link Best Practices

1. **Use Descriptive Labels**: Make labels clear and specific (e.g., "Amendment 1 - Rent Increase" instead of just "Amendment")
2. **Consistent Naming**: Use consistent naming conventions for ECM identifiers across your organization
3. **Version Control**: Include version information in labels when applicable
4. **Document Type**: Consider including document type in the label (e.g., "Lease Agreement", "Estoppel Certificate", "Subordination Agreement")
5. **Date References**: Include dates in labels for time-sensitive documents (e.g., "Estoppel Certificate - 2024-Q4")
