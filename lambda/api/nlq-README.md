# Natural Language Query API

## Overview

The Natural Language Query (NLQ) API allows AWS agents and applications to query the lease database using conversational natural language instead of writing SQL queries directly. The API uses AWS Bedrock for intent classification and generates safe, parameterized SQL queries.

## Endpoint

```
POST /query/natural-language
```

## Request Format

```json
{
  "query": "Show me leases expiring in the next 6 months",
  "debug": false
}
```

### Request Fields

- `query` (required, string): Natural language query (max 500 characters)
- `debug` (optional, boolean): Include SQL and debug information in response

## Response Format

### Successful Response

```json
{
  "query": "Show me leases expiring in the next 6 months",
  "intent": "expiration",
  "confidence": 0.95,
  "results": [
    {
      "lease_id": 1,
      "master_lease_num": "L-2024-001",
      "tenant_name": "Acme Corp",
      "property_name": "Building A",
      "state": "CA",
      "expiration_date": "2024-12-31",
      "months_to_expiration": 5.5
    }
  ],
  "metadata": {
    "intent": "expiration",
    "confidence": 0.95,
    "parameters": {
      "time_value": 6,
      "time_unit": "month"
    },
    "view": "vw_expirations",
    "result_count": 1,
    "classification_time_ms": 250,
    "sql_generation_time_ms": 5,
    "execution_time_ms": 45,
    "total_time_ms": 300,
    "request_id": "abc-123-def"
  }
}
```

### Clarification Response

When the query is ambiguous or unsupported:

```json
{
  "query": "show me stuff",
  "intent": "unknown",
  "confidence": 0.3,
  "clarification": "I don't understand this query. Try asking about lease expirations, rent roll, options, or financial data.",
  "results": [],
  "metadata": {
    "intent": "unknown",
    "confidence": 0.3,
    "classification_time_ms": 200,
    "execution_time_ms": 0,
    "total_time_ms": 205,
    "request_id": "xyz-789"
  }
}
```

### Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing or invalid query field",
    "details": [
      {
        "field": "query",
        "message": "Query must be a non-empty string"
      }
    ]
  }
}
```

## Supported Query Types

### 1. Expiration Queries

Find leases expiring within a timeframe.

**Examples:**
- "Show me leases expiring in the next 6 months"
- "Which leases in California expire this year?"
- "Find leases ending in the next 90 days"
- "Show expirations for Building A"

**Intent:** `expiration`

**Extracted Parameters:**
- `time_value`, `time_unit`: Time period (e.g., 6 months, 90 days)
- `state`: US state filter
- `property_name`: Property/building name
- `tenant_name`: Tenant name

**Database View:** `vw_expirations`

### 2. Rent Roll Queries

Get current rent information.

**Examples:**
- "What's the current rent roll?"
- "Show me rent for Building A"
- "Find leases with monthly rent over $10,000"
- "What's the rent for Acme Corp?"

**Intent:** `rent_roll`

**Extracted Parameters:**
- `property_name`: Property/building name
- `tenant_name`: Tenant name
- `amount_threshold`: Minimum rent amount

**Database View:** `vw_rent_roll_current`

### 3. Options Queries

Find lease options (renewal, termination, expansion, ROFR).

**Examples:**
- "Show me renewal options with open notice windows"
- "Which termination options are available?"
- "Find all options for Tenant X"
- "Show expansion options for Building A"

**Intent:** `options`

**Extracted Parameters:**
- `option_type`: RENEWAL, TERMINATION, EXPANSION, ROFR
- `window_status`: open or closed
- `property_name`: Property/building name
- `tenant_name`: Tenant name

**Database View:** `vw_options_status`

### 4. Financial Queries

Get TI allowances or free rent information.

**Examples:**
- "Show me TI allowances for all leases"
- "What's the total tenant improvement for Building A?"
- "Find active free rent periods"
- "Show concessions for Tenant X"

**Intent:** `financial`

**Extracted Parameters:**
- `property_name`: Property/building name
- `tenant_name`: Tenant name

**Database Views:** `vw_ti_allowance_summary`, `vw_free_rent_status`

### 5. Critical Dates Queries

Find upcoming important dates.

**Examples:**
- "Show me critical dates in the next 90 days"
- "What important dates are coming up?"
- "Find notice deadlines for Building A"
- "Show commencement dates"

**Intent:** `critical_dates`

**Extracted Parameters:**
- `time_value`, `time_unit`: Time period (default: 180 days)
- `property_name`: Property/building name
- `tenant_name`: Tenant name

**Database View:** `vw_critical_dates_upcoming`

### 6. Amendment Queries

View lease amendment history.

**Examples:**
- "Show me amendment history for Lease 123"
- "What versions exist for this lease?"
- "Show lease changes for Tenant X"

**Intent:** `amendments`

**Extracted Parameters:**
- `property_name`: Property/building name
- `tenant_name`: Tenant name

**Database View:** `vw_amendment_history`

### 7. OpEx Queries

Get operating expense pass-through information.

**Examples:**
- "Show me OpEx configurations"
- "What's the expense recovery method for Building A?"
- "Find base year OpEx leases"

**Intent:** `opex`

**Extracted Parameters:**
- `property_name`: Property/building name

**Database View:** `vw_opex_summary`

## Architecture

### Flow

1. **Intent Classification**: AWS Bedrock (Claude 3 Haiku) classifies the query into one of 7 intent categories
2. **Parameter Extraction**: Extract filters like property names, dates, amounts from the query
3. **SQL Generation**: Generate safe, parameterized SQL using templates
4. **Validation**: Ensure SQL only accesses whitelisted views
5. **Execution**: Run query against PostgreSQL database
6. **Response Formatting**: Return results in agent-friendly JSON format

### Security

- **Parameterized Queries**: All user inputs are parameterized to prevent SQL injection
- **View Whitelist**: Only predefined reporting views can be accessed
- **Operation Whitelist**: Only SELECT queries allowed (no INSERT, UPDATE, DELETE, DROP)
- **Result Limits**: Maximum 50 results per query (configurable)
- **Query Length**: Maximum 500 characters
- **Timeout**: 30-second query timeout

### Fallback Mechanism

If AWS Bedrock is unavailable, the system falls back to rule-based intent classification using keyword matching. This ensures the API remains functional even if Bedrock has issues.

## Configuration

### Environment Variables

- `BEDROCK_MODEL_ID`: Bedrock model to use (default: `anthropic.claude-3-haiku-20240307-v1:0`)
- `AWS_REGION`: AWS region for Bedrock (default: `us-east-1`)
- `LOG_LEVEL`: Set to `DEBUG` to include SQL in responses
- `DB_SECRET_ARN`: Database credentials secret ARN
- `DB_PROXY_ENDPOINT`: RDS Proxy endpoint

### IAM Permissions

The Lambda execution role needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*:*:model/anthropic.claude-3-haiku-20240307-v1:0"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:lease-db-*"
    }
  ]
}
```

## Usage Examples

### cURL

```bash
curl -X POST https://api.example.com/query/natural-language \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Show me leases expiring in the next 6 months in California"
  }'
```

### Python (boto3)

```python
import boto3
import json

lambda_client = boto3.client('lambda')

response = lambda_client.invoke(
    FunctionName='lease-api-nlq',
    InvocationType='RequestResponse',
    Payload=json.dumps({
        'httpMethod': 'POST',
        'body': json.dumps({
            'query': 'Show me leases expiring in the next 6 months'
        })
    })
)

result = json.loads(response['Payload'].read())
print(json.dumps(result, indent=2))
```

### AWS Bedrock Agent

```python
# In your agent's action group
def query_lease_database(query: str) -> dict:
    """
    Query the lease database using natural language.
    
    Args:
        query: Natural language query about leases
        
    Returns:
        Query results with metadata
    """
    import requests
    
    response = requests.post(
        'https://api.example.com/query/natural-language',
        json={'query': query}
    )
    
    return response.json()
```

## Performance

- **Classification Time**: ~200-300ms (Bedrock)
- **SQL Generation**: ~5-10ms
- **Query Execution**: ~50-500ms (depends on complexity)
- **Total Response Time**: ~300-800ms

## Limitations

- Maximum query length: 500 characters
- Maximum results: 50 per query (configurable)
- Query timeout: 30 seconds
- Only SELECT queries supported
- Only predefined views accessible
- No support for complex joins or aggregations beyond what views provide

## Error Codes

- `METHOD_NOT_ALLOWED`: Only POST requests accepted
- `INVALID_JSON`: Request body is not valid JSON
- `VALIDATION_ERROR`: Missing or invalid query field
- `SECURITY_ERROR`: Query failed security validation
- `DATABASE_ERROR`: Database query execution failed
- `INTERNAL_ERROR`: Unexpected server error

## Monitoring

The API logs the following metrics to CloudWatch:

- Request count
- Intent classification time
- SQL generation time
- Query execution time
- Total response time
- Error rate by error type
- Intent distribution
- Confidence scores

## Future Enhancements

- Support for aggregations ("What's the total rent across all properties?")
- Multi-step queries ("Show me leases expiring soon, then filter by state")
- Query history and learning from user feedback
- Support for more complex date math
- Natural language result summaries
- Voice query support
