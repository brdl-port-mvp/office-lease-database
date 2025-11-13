# Document Link API

Lambda function for managing lease document links (external references to documents).

## Overview

The Document Link API provides CRUD operations for storing references to external lease documents. This allows linking to document management systems or file storage without storing actual files in the database.

## Endpoints

### POST /doc-links
Create a new document link.

**Request Body:**
```json
{
  "lease_id": 1,
  "label": "Original Lease Agreement",
  "external_ref": "https://docs.example.com/lease-001.pdf"
}
```

**Response (201 Created):**
```json
{
  "doc_id": 1,
  "lease_id": 1,
  "label": "Original Lease Agreement",
  "external_ref": "https://docs.example.com/lease-001.pdf",
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z"
}
```

### GET /doc-links
List document links with optional filtering.

**Query Parameters:**
- `lease_id` (optional): Filter by lease ID
- `sort_by` (optional): Sort field (doc_id, label, created_at, updated_at). Default: created_at
- `sort_order` (optional): ASC or DESC. Default: DESC
- `limit` (optional): Number of results per page. Default: 50
- `offset` (optional): Pagination offset. Default: 0

**Example Request:**
```
GET /doc-links?lease_id=1&sort_by=label&sort_order=ASC&limit=10&offset=0
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "doc_id": 1,
      "lease_id": 1,
      "label": "Amendment 1",
      "external_ref": "https://docs.example.com/amendment-1.pdf",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    },
    {
      "doc_id": 2,
      "lease_id": 1,
      "label": "Original Lease Agreement",
      "external_ref": "ECM-2024-001",
      "created_at": "2024-01-10T09:00:00.000Z",
      "updated_at": "2024-01-10T09:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "limit": 10,
    "offset": 0,
    "count": 2
  }
}
```

### GET /doc-links/{id}
Get a single document link by ID.

**Response (200 OK):**
```json
{
  "doc_id": 1,
  "lease_id": 1,
  "label": "Original Lease Agreement",
  "external_ref": "https://docs.example.com/lease-001.pdf",
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z"
}
```

**Response (404 Not Found):**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Document link not found",
    "details": [
      {
        "field": "doc_id",
        "value": "999"
      }
    ]
  }
}
```

### PUT /doc-links/{id}
Update an existing document link.

**Request Body:**
```json
{
  "label": "Updated Label",
  "external_ref": "https://docs.example.com/updated-doc.pdf"
}
```

**Response (200 OK):**
```json
{
  "doc_id": 1,
  "lease_id": 1,
  "label": "Updated Label",
  "external_ref": "https://docs.example.com/updated-doc.pdf",
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T11:45:00.000Z"
}
```

### DELETE /doc-links/{id}
Delete a document link.

**Response (204 No Content):**
Empty response body.

**Response (404 Not Found):**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Document link not found",
    "details": [
      {
        "field": "doc_id",
        "value": "999"
      }
    ]
  }
}
```

## External Reference Format

The `external_ref` field accepts two formats:

### 1. URL Format
Valid HTTP or HTTPS URLs pointing to documents:
```
https://docs.example.com/lease-001.pdf
http://internal-docs.company.com/files/lease.docx
https://s3.amazonaws.com/bucket/documents/lease-123.pdf
```

### 2. ECM Identifier Format
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

## Validation Rules

### Required Fields (Create)
- `lease_id`: Must be a valid lease ID (positive integer)
- `label`: Non-empty string describing the document
- `external_ref`: Valid URL or ECM identifier

### Optional Fields (Update)
- `label`: Non-empty string
- `external_ref`: Valid URL or ECM identifier

### Constraints
- `lease_id` must reference an existing lease
- `label` cannot be empty or whitespace-only
- `external_ref` must be either:
  - A valid URL with http:// or https:// protocol
  - A valid ECM identifier (alphanumeric with hyphens, underscores, periods)

## Error Responses

### 400 Bad Request - Validation Error
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
    ]
  }
}
```

### 400 Bad Request - Invalid Reference
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
    ]
  }
}
```

### 404 Not Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Document link not found",
    "details": [
      {
        "field": "doc_id",
        "value": "123"
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

## Usage Examples

### Create a document link with URL
```bash
curl -X POST https://api.example.com/doc-links \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "label": "Original Lease Agreement",
    "external_ref": "https://docs.example.com/lease-001.pdf"
  }'
```

### Create a document link with ECM identifier
```bash
curl -X POST https://api.example.com/doc-links \
  -H "Content-Type: application/json" \
  -d '{
    "lease_id": 1,
    "label": "Amendment 1",
    "external_ref": "ECM-2024-001"
  }'
```

### List all document links for a lease
```bash
curl -X GET "https://api.example.com/doc-links?lease_id=1"
```

### Update a document link
```bash
curl -X PUT https://api.example.com/doc-links/1 \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Updated Lease Agreement",
    "external_ref": "https://docs.example.com/updated-lease.pdf"
  }'
```

### Delete a document link
```bash
curl -X DELETE https://api.example.com/doc-links/1
```

## Database Schema

The document link API interacts with the `doc_link` table:

```sql
CREATE TABLE doc_link (
  doc_id SERIAL PRIMARY KEY,
  lease_id INTEGER NOT NULL REFERENCES lease(lease_id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  external_ref TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Requirements Mapping

This API satisfies the following requirements:

- **10.1**: Store Document Link records with lease reference, label, and external reference
- **10.2**: Allow multiple Document Links per Lease
- **10.3**: Store external references as URLs or document management system identifiers
- **21.1**: Provide REST API endpoints for CRUD operations
- **21.2**: Support query parameters for filtering and pagination
- **21.3**: Return responses in JSON format
- **21.4**: Implement proper HTTP status codes
- **21.5**: Provide detailed error responses with validation details
