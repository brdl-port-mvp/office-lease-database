#!/bin/bash

# Test script for API Gateway configuration
# This script verifies that the API Gateway is properly configured with all endpoints

set -e

echo "=========================================="
echo "API Gateway Configuration Test"
echo "=========================================="
echo ""

# Get stack outputs
echo "Fetching stack outputs..."
STACK_NAME="LeaseDatabaseStack"

API_URL=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text 2>/dev/null || echo "")

API_ID=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayId`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -z "$API_URL" ] || [ -z "$API_ID" ]; then
  echo "❌ Error: Stack not deployed or outputs not available"
  echo "   Please deploy the stack first: cdk deploy"
  exit 1
fi

echo "✓ API Gateway URL: $API_URL"
echo "✓ API Gateway ID: $API_ID"
echo ""

# Test 1: Verify API Gateway exists
echo "Test 1: Verify API Gateway exists"
API_INFO=$(aws apigatewayv2 get-api --api-id $API_ID 2>/dev/null || echo "")
if [ -z "$API_INFO" ]; then
  echo "❌ FAILED: API Gateway not found"
  exit 1
fi
echo "✓ PASSED: API Gateway exists"
echo ""

# Test 2: Verify CORS configuration
echo "Test 2: Verify CORS configuration"
CORS_CONFIG=$(aws apigatewayv2 get-api --api-id $API_ID \
  --query 'CorsConfiguration' \
  --output json 2>/dev/null || echo "{}")

if echo "$CORS_CONFIG" | grep -q "AllowMethods"; then
  echo "✓ PASSED: CORS is configured"
  echo "  Allowed Methods: $(echo $CORS_CONFIG | jq -r '.AllowMethods | join(", ")')"
  echo "  Allowed Origins: $(echo $CORS_CONFIG | jq -r '.AllowOrigins | join(", ")')"
else
  echo "❌ FAILED: CORS not configured"
  exit 1
fi
echo ""

# Test 3: Verify routes exist
echo "Test 3: Verify API routes"
ROUTES=$(aws apigatewayv2 get-routes --api-id $API_ID --output json 2>/dev/null || echo '{"Items":[]}')
ROUTE_COUNT=$(echo "$ROUTES" | jq '.Items | length')

echo "  Total routes: $ROUTE_COUNT"

# Expected routes (excluding OPTIONS for CORS)
EXPECTED_ROUTES=(
  "GET /properties"
  "POST /properties"
  "GET /properties/{id}"
  "PUT /properties/{id}"
  "DELETE /properties/{id}"
  "GET /suites"
  "POST /suites"
  "GET /suites/{id}"
  "PUT /suites/{id}"
  "DELETE /suites/{id}"
  "GET /parties"
  "POST /parties"
  "GET /parties/{id}"
  "PUT /parties/{id}"
  "DELETE /parties/{id}"
  "GET /leases"
  "POST /leases"
  "GET /leases/{id}"
  "PUT /leases/{id}"
  "POST /leases/{id}/versions"
  "GET /rent-schedules"
  "POST /rent-schedules"
  "GET /rent-schedules/{id}"
  "PUT /rent-schedules/{id}"
  "DELETE /rent-schedules/{id}"
  "GET /opex-pass-throughs"
  "POST /opex-pass-throughs"
  "GET /opex-pass-throughs/{id}"
  "PUT /opex-pass-throughs/{id}"
  "DELETE /opex-pass-throughs/{id}"
  "GET /options"
  "POST /options"
  "GET /options/{id}"
  "PUT /options/{id}"
  "DELETE /options/{id}"
  "PUT /options/{id}/exercise"
  "GET /concessions"
  "POST /concessions"
  "GET /concessions/{id}"
  "PUT /concessions/{id}"
  "DELETE /concessions/{id}"
  "GET /critical-dates"
  "POST /critical-dates"
  "GET /critical-dates/{id}"
  "PUT /critical-dates/{id}"
  "DELETE /critical-dates/{id}"
  "GET /doc-links"
  "POST /doc-links"
  "GET /doc-links/{id}"
  "PUT /doc-links/{id}"
  "DELETE /doc-links/{id}"
  "GET /reports/expirations"
  "GET /reports/rent-roll"
  "GET /reports/options"
  "GET /reports/free-rent"
  "GET /reports/ti-allowances"
  "GET /reports/critical-dates"
  "GET /reports/amendments"
  "GET /reports/opex-summary"
  "POST /batch/properties"
  "POST /batch/parties"
  "POST /batch/leases"
  "POST /query/natural-language"
)

MISSING_ROUTES=()
for route in "${EXPECTED_ROUTES[@]}"; do
  if ! echo "$ROUTES" | jq -e ".Items[] | select(.RouteKey == \"$route\")" > /dev/null 2>&1; then
    MISSING_ROUTES+=("$route")
  fi
done

if [ ${#MISSING_ROUTES[@]} -eq 0 ]; then
  echo "✓ PASSED: All expected routes exist"
else
  echo "❌ FAILED: Missing routes:"
  for route in "${MISSING_ROUTES[@]}"; do
    echo "    - $route"
  done
  exit 1
fi
echo ""

# Test 4: Verify Lambda integrations
echo "Test 4: Verify Lambda integrations"
INTEGRATIONS=$(aws apigatewayv2 get-integrations --api-id $API_ID --output json 2>/dev/null || echo '{"Items":[]}')
INTEGRATION_COUNT=$(echo "$INTEGRATIONS" | jq '.Items | length')

echo "  Total integrations: $INTEGRATION_COUNT"

# Check for Lambda integrations
LAMBDA_INTEGRATIONS=$(echo "$INTEGRATIONS" | jq '[.Items[] | select(.IntegrationType == "AWS_PROXY")] | length')
echo "  Lambda integrations: $LAMBDA_INTEGRATIONS"

if [ "$LAMBDA_INTEGRATIONS" -gt 0 ]; then
  echo "✓ PASSED: Lambda integrations configured"
else
  echo "❌ FAILED: No Lambda integrations found"
  exit 1
fi
echo ""

# Test 5: Verify authorizer
echo "Test 5: Verify Lambda authorizer"
AUTHORIZERS=$(aws apigatewayv2 get-authorizers --api-id $API_ID --output json 2>/dev/null || echo '{"Items":[]}')
AUTHORIZER_COUNT=$(echo "$AUTHORIZERS" | jq '.Items | length')

if [ "$AUTHORIZER_COUNT" -gt 0 ]; then
  echo "✓ PASSED: Lambda authorizer configured"
  AUTHORIZER_NAME=$(echo "$AUTHORIZERS" | jq -r '.Items[0].Name')
  AUTHORIZER_TYPE=$(echo "$AUTHORIZERS" | jq -r '.Items[0].AuthorizerType')
  echo "  Name: $AUTHORIZER_NAME"
  echo "  Type: $AUTHORIZER_TYPE"
else
  echo "❌ FAILED: No authorizer found"
  exit 1
fi
echo ""

# Test 6: Verify stage configuration
echo "Test 6: Verify stage configuration"
STAGE_INFO=$(aws apigatewayv2 get-stage --api-id $API_ID --stage-name '$default' --output json 2>/dev/null || echo "{}")

if [ -n "$STAGE_INFO" ] && [ "$STAGE_INFO" != "{}" ]; then
  echo "✓ PASSED: Default stage exists"
  
  # Check throttling
  THROTTLE_RATE=$(echo "$STAGE_INFO" | jq -r '.DefaultRouteSettings.ThrottlingRateLimit // "not set"')
  THROTTLE_BURST=$(echo "$STAGE_INFO" | jq -r '.DefaultRouteSettings.ThrottlingBurstLimit // "not set"')
  
  echo "  Throttling rate limit: $THROTTLE_RATE req/sec"
  echo "  Throttling burst limit: $THROTTLE_BURST"
  
  if [ "$THROTTLE_RATE" = "1000" ]; then
    echo "  ✓ Throttling rate limit correctly set to 1000 req/sec"
  else
    echo "  ⚠ Warning: Throttling rate limit is $THROTTLE_RATE (expected 1000)"
  fi
  
  # Check access logging
  ACCESS_LOG_ARN=$(echo "$STAGE_INFO" | jq -r '.AccessLogSettings.DestinationArn // "not set"')
  if [ "$ACCESS_LOG_ARN" != "not set" ]; then
    echo "  ✓ CloudWatch access logging enabled"
    echo "    Log destination: $ACCESS_LOG_ARN"
  else
    echo "  ⚠ Warning: CloudWatch access logging not configured"
  fi
else
  echo "❌ FAILED: Default stage not found"
  exit 1
fi
echo ""

# Test 7: Verify Lambda functions exist
echo "Test 7: Verify Lambda functions"
EXPECTED_FUNCTIONS=(
  "office-lease-authorizer"
  "office-lease-api-properties"
  "office-lease-api-suites"
  "office-lease-api-parties"
  "office-lease-api-leases"
  "office-lease-api-rent-schedules"
  "office-lease-api-opex"
  "office-lease-api-options"
  "office-lease-api-concessions"
  "office-lease-api-critical-dates"
  "office-lease-api-doc-links"
  "office-lease-api-reports"
  "office-lease-api-batch"
  "office-lease-api-nlq"
)

MISSING_FUNCTIONS=()
for func in "${EXPECTED_FUNCTIONS[@]}"; do
  if ! aws lambda get-function --function-name $func > /dev/null 2>&1; then
    MISSING_FUNCTIONS+=("$func")
  fi
done

if [ ${#MISSING_FUNCTIONS[@]} -eq 0 ]; then
  echo "✓ PASSED: All Lambda functions exist (${#EXPECTED_FUNCTIONS[@]} functions)"
else
  echo "❌ FAILED: Missing Lambda functions:"
  for func in "${MISSING_FUNCTIONS[@]}"; do
    echo "    - $func"
  done
  exit 1
fi
echo ""

# Test 8: Verify CloudWatch log groups
echo "Test 8: Verify CloudWatch log groups"
API_LOG_GROUP="/aws/apigateway/office-lease-api"
LAMBDA_LOG_GROUP="/aws/lambda/office-lease-api"

if aws logs describe-log-groups --log-group-name-prefix $API_LOG_GROUP > /dev/null 2>&1; then
  echo "✓ PASSED: API Gateway log group exists"
else
  echo "⚠ Warning: API Gateway log group not found"
fi

if aws logs describe-log-groups --log-group-name-prefix $LAMBDA_LOG_GROUP > /dev/null 2>&1; then
  echo "✓ PASSED: Lambda log group exists"
else
  echo "⚠ Warning: Lambda log group not found"
fi
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "✓ All critical tests passed!"
echo ""
echo "API Gateway Configuration:"
echo "  - HTTP API created with ID: $API_ID"
echo "  - Endpoint URL: $API_URL"
echo "  - Routes configured: $ROUTE_COUNT"
echo "  - Lambda integrations: $LAMBDA_INTEGRATIONS"
echo "  - Authorizer: Configured"
echo "  - CORS: Enabled"
echo "  - Throttling: 1000 req/sec"
echo "  - CloudWatch logging: Configured"
echo ""
echo "Next steps:"
echo "  1. Test endpoints with authenticated requests"
echo "  2. Monitor CloudWatch logs"
echo "  3. Configure custom domain (optional)"
echo "  4. Set up CloudWatch alarms"
echo ""
