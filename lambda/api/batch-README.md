# Batch Operations API

This Lambda function handles bulk create/update operations for properties, parties, and leases.

## Endpoints

### POST /batch/properties
Bulk create or update properties.

**Request Body:**
```json
{
  "records": [
    {
      "property_id": 1,  // Optional - if provided, updates existing property
      "name": "Building A",
      "address": "123 Main St",
      "state": "CA",
      "postal_code": "90210",
      "country": "USA",
      "total_rsf": 50000,
      "active": true
    }
  ]
}
```

**Response:**
```json
{
  "total": 1,
  "successful": 1,
  "failed": 0,
  "results": [
    {
      "index": 0,
      "success": true,
      "data": {
        "property_id": 1,
        "name": "Building A",
        ...
      }
    }
  ]
}
```

### POST /batch/parties
Bulk create or update parties.

**Request Body:**
```json
{
  "records": [
    {
      "party_id": 1,  // Optional - if provided, updates existing party
      "legal_name": "Acme Corp",
      "party_type": "TENANT",
      "active": true
    }
  ]
}
```

### POST /batch/leases
Bulk create or update leases with initial versions.

**Request Body:**
```json
{
  "records": [
    {
      "lease_id": 1,  // Optional - if provided, updates existing lease
      "property_id": 1,
      "landlord_id": 2,
      "tenant_id": 3,
      "master_lease_num": "LEASE-001",
      "execution_date": "2024-01-01",
      "initial_version": {  // Optional - only for new leases
        "effective_daterange": "[2024-01-01,2029-01-01)",
        "suite_id": 1,
        "premises_rsf": 5000,
        "term_months": 60,
        "base_year": 2024,
        "escalation_method": "CPI",
        "currency_code": "USD",
        "notes": "Initial lease version"
      }
    }
  ]
}
```

## Features

- **Batch Size Limit**: Maximum 100 records per request
- **Transactional**: All operations execute in a single transaction - if any record fails, all changes are rolled back
- **Individual Validation**: Each record is validated individually with detailed error reporting
- **Create or Update**: Records with IDs are updated, records without IDs are created
- **Foreign Key Validation**: All references are validated before processing

## Error Handling

If any record fails validation or processing, the entire batch is rolled back and an error response is returned:

```json
{
  "error": {
    "code": "BATCH_FAILED",
    "message": "Batch operation failed and was rolled back",
    "details": [
      {
        "message": "Validation failed"
      }
    ]
  }
}
```

Individual record errors are included in the results array:

```json
{
  "total": 2,
  "successful": 0,
  "failed": 2,
  "results": [
    {
      "index": 0,
      "success": false,
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "Invalid property data",
        "details": [
          {
            "field": "name",
            "message": "Property name is required"
          }
        ]
      }
    }
  ]
}
```

## Requirements Addressed

- **25.1**: Batch creation endpoints for properties, parties, and leases
- **25.2**: Batch update endpoints for properties, parties, and leases
- **25.3**: Detailed error information for failed records
- **25.4**: Transactional processing for data consistency
- **25.5**: Support for batch sizes up to 100 records per request
