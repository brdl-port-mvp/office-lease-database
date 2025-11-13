# Batch Operations API Examples

## Example 1: Batch Create Properties

```bash
curl -X POST https://api.example.com/batch/properties \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {
        "name": "Building A",
        "address": "123 Main St",
        "state": "CA",
        "postal_code": "90210",
        "country": "USA",
        "total_rsf": 50000,
        "active": true
      },
      {
        "name": "Building B",
        "address": "456 Oak Ave",
        "state": "NY",
        "postal_code": "10001",
        "country": "USA",
        "total_rsf": 75000,
        "active": true
      }
    ]
  }'
```

**Response:**
```json
{
  "total": 2,
  "successful": 2,
  "failed": 0,
  "results": [
    {
      "index": 0,
      "success": true,
      "data": {
        "property_id": 1,
        "name": "Building A",
        "address": "123 Main St",
        "state": "CA",
        "postal_code": "90210",
        "country": "USA",
        "total_rsf": 50000,
        "active": true,
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z"
      }
    },
    {
      "index": 1,
      "success": true,
      "data": {
        "property_id": 2,
        "name": "Building B",
        "address": "456 Oak Ave",
        "state": "NY",
        "postal_code": "10001",
        "country": "USA",
        "total_rsf": 75000,
        "active": true,
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-15T10:30:00Z"
      }
    }
  ]
}
```

## Example 2: Batch Update Properties

```bash
curl -X POST https://api.example.com/batch/properties \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {
        "property_id": 1,
        "total_rsf": 55000
      },
      {
        "property_id": 2,
        "active": false
      }
    ]
  }'
```

## Example 3: Batch Create Parties

```bash
curl -X POST https://api.example.com/batch/parties \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {
        "legal_name": "Acme Corporation",
        "party_type": "TENANT",
        "active": true
      },
      {
        "legal_name": "Property Holdings LLC",
        "party_type": "LANDLORD",
        "active": true
      },
      {
        "legal_name": "Guarantor Inc",
        "party_type": "GUARANTOR",
        "active": true
      }
    ]
  }'
```

## Example 4: Batch Create Leases with Initial Versions

```bash
curl -X POST https://api.example.com/batch/leases \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {
        "property_id": 1,
        "landlord_id": 2,
        "tenant_id": 1,
        "master_lease_num": "LEASE-001",
        "execution_date": "2024-01-01",
        "initial_version": {
          "effective_daterange": "[2024-01-01,2029-01-01)",
          "suite_id": 1,
          "premises_rsf": 5000,
          "term_months": 60,
          "base_year": 2024,
          "escalation_method": "CPI",
          "currency_code": "USD",
          "notes": "Initial 5-year lease"
        }
      },
      {
        "property_id": 2,
        "landlord_id": 2,
        "tenant_id": 3,
        "master_lease_num": "LEASE-002",
        "execution_date": "2024-02-01",
        "initial_version": {
          "effective_daterange": "[2024-02-01,2027-02-01)",
          "suite_id": 2,
          "premises_rsf": 3000,
          "term_months": 36,
          "base_year": 2024,
          "escalation_method": "FIXED",
          "currency_code": "USD",
          "notes": "3-year lease with fixed escalation"
        }
      }
    ]
  }'
```

**Response:**
```json
{
  "total": 2,
  "successful": 2,
  "failed": 0,
  "results": [
    {
      "index": 0,
      "success": true,
      "data": {
        "lease": {
          "lease_id": 1,
          "property_id": 1,
          "landlord_id": 2,
          "tenant_id": 1,
          "master_lease_num": "LEASE-001",
          "execution_date": "2024-01-01",
          "created_at": "2024-01-15T10:30:00Z",
          "updated_at": "2024-01-15T10:30:00Z"
        },
        "initial_version": {
          "lease_version_id": 1,
          "lease_id": 1,
          "version_num": 0,
          "effective_daterange": "[2024-01-01,2029-01-01)",
          "suite_id": 1,
          "premises_rsf": 5000,
          "term_months": 60,
          "base_year": 2024,
          "escalation_method": "CPI",
          "currency_code": "USD",
          "is_current": true,
          "notes": "Initial 5-year lease",
          "created_at": "2024-01-15T10:30:00Z",
          "updated_at": "2024-01-15T10:30:00Z"
        }
      }
    },
    {
      "index": 1,
      "success": true,
      "data": {
        "lease": {
          "lease_id": 2,
          "property_id": 2,
          "landlord_id": 2,
          "tenant_id": 3,
          "master_lease_num": "LEASE-002",
          "execution_date": "2024-02-01",
          "created_at": "2024-01-15T10:30:00Z",
          "updated_at": "2024-01-15T10:30:00Z"
        },
        "initial_version": {
          "lease_version_id": 2,
          "lease_id": 2,
          "version_num": 0,
          "effective_daterange": "[2024-02-01,2027-02-01)",
          "suite_id": 2,
          "premises_rsf": 3000,
          "term_months": 36,
          "base_year": 2024,
          "escalation_method": "FIXED",
          "currency_code": "USD",
          "is_current": true,
          "notes": "3-year lease with fixed escalation",
          "created_at": "2024-01-15T10:30:00Z",
          "updated_at": "2024-01-15T10:30:00Z"
        }
      }
    }
  ]
}
```

## Example 5: Error Handling - Validation Failure

```bash
curl -X POST https://api.example.com/batch/properties \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {
        "address": "123 Main St"
      }
    ]
  }'
```

**Response (400 Bad Request):**
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

## Example 6: Mixed Create and Update

```bash
curl -X POST https://api.example.com/batch/parties \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {
        "legal_name": "New Tenant LLC",
        "party_type": "TENANT",
        "active": true
      },
      {
        "party_id": 1,
        "active": false
      }
    ]
  }'
```

This creates a new party and updates an existing one in a single transaction.

## Notes

- All operations within a batch are executed in a single database transaction
- If any record fails validation or processing, the entire batch is rolled back
- Maximum batch size is 100 records per request
- Records with an ID field are treated as updates, records without are treated as creates
- For leases, the `initial_version` is only used when creating new leases (not for updates)
