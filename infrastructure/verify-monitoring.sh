#!/bin/bash

# Verification script for monitoring and alerting setup
# Run this after deploying the CDK stack to verify all components are working

set -e

STACK_NAME="OfficeLeaseDatabaseStack"
REGION="${AWS_REGION:-us-east-1}"

echo "========================================="
echo "Monitoring and Alerting Verification"
echo "========================================="
echo ""

# Check if stack exists
echo "1. Checking CloudFormation stack..."
if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION &> /dev/null; then
    echo "   ✅ Stack '$STACK_NAME' exists"
else
    echo "   ❌ Stack '$STACK_NAME' not found"
    exit 1
fi
echo ""

# Get stack outputs
echo "2. Retrieving stack outputs..."
ALARM_TOPIC_ARN=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`AlarmTopicArn`].OutputValue' \
    --output text)

DASHBOARD_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
    --output text)

API_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text)

if [ -n "$ALARM_TOPIC_ARN" ]; then
    echo "   ✅ Alarm Topic ARN: $ALARM_TOPIC_ARN"
else
    echo "   ❌ Alarm Topic ARN not found"
fi

if [ -n "$DASHBOARD_URL" ]; then
    echo "   ✅ Dashboard URL: $DASHBOARD_URL"
else
    echo "   ❌ Dashboard URL not found"
fi

if [ -n "$API_URL" ]; then
    echo "   ✅ API Gateway URL: $API_URL"
else
    echo "   ❌ API Gateway URL not found"
fi
echo ""

# Check SNS topic
echo "3. Checking SNS topic..."
if aws sns get-topic-attributes --topic-arn $ALARM_TOPIC_ARN --region $REGION &> /dev/null; then
    echo "   ✅ SNS topic exists"
    
    # Check subscriptions
    SUBSCRIPTION_COUNT=$(aws sns list-subscriptions-by-topic \
        --topic-arn $ALARM_TOPIC_ARN \
        --region $REGION \
        --query 'length(Subscriptions)' \
        --output text)
    
    if [ "$SUBSCRIPTION_COUNT" -gt 0 ]; then
        echo "   ✅ SNS topic has $SUBSCRIPTION_COUNT subscription(s)"
        aws sns list-subscriptions-by-topic \
            --topic-arn $ALARM_TOPIC_ARN \
            --region $REGION \
            --query 'Subscriptions[*].[Protocol,Endpoint,SubscriptionArn]' \
            --output table
    else
        echo "   ⚠️  SNS topic has no subscriptions"
        echo "      Add a subscription with:"
        echo "      aws sns subscribe --topic-arn $ALARM_TOPIC_ARN --protocol email --notification-endpoint your-email@example.com"
    fi
else
    echo "   ❌ SNS topic not accessible"
fi
echo ""

# Check CloudWatch dashboard
echo "4. Checking CloudWatch dashboard..."
DASHBOARD_NAME="office-lease-data-platform"
if aws cloudwatch get-dashboard --dashboard-name $DASHBOARD_NAME --region $REGION &> /dev/null; then
    echo "   ✅ Dashboard '$DASHBOARD_NAME' exists"
else
    echo "   ❌ Dashboard '$DASHBOARD_NAME' not found"
fi
echo ""

# Check CloudWatch alarms
echo "5. Checking CloudWatch alarms..."
ALARMS=(
    "office-lease-api-error-rate"
    "office-lease-api-latency"
    "office-lease-lambda-errors"
    "office-lease-db-cpu"
    "office-lease-db-connections"
)

for ALARM_NAME in "${ALARMS[@]}"; do
    if aws cloudwatch describe-alarms --alarm-names $ALARM_NAME --region $REGION --query 'MetricAlarms[0]' &> /dev/null; then
        STATE=$(aws cloudwatch describe-alarms \
            --alarm-names $ALARM_NAME \
            --region $REGION \
            --query 'MetricAlarms[0].StateValue' \
            --output text)
        echo "   ✅ Alarm '$ALARM_NAME' exists (State: $STATE)"
    else
        echo "   ❌ Alarm '$ALARM_NAME' not found"
    fi
done
echo ""

# Check log groups
echo "6. Checking CloudWatch log groups..."
LOG_GROUPS=(
    "/aws/apigateway/office-lease-api"
    "/aws/lambda/office-lease-api"
)

for LOG_GROUP in "${LOG_GROUPS[@]}"; do
    if aws logs describe-log-groups --log-group-name-prefix $LOG_GROUP --region $REGION --query 'logGroups[0]' &> /dev/null; then
        RETENTION=$(aws logs describe-log-groups \
            --log-group-name-prefix $LOG_GROUP \
            --region $REGION \
            --query 'logGroups[0].retentionInDays' \
            --output text)
        echo "   ✅ Log group '$LOG_GROUP' exists (Retention: ${RETENTION:-Unlimited} days)"
    else
        echo "   ❌ Log group '$LOG_GROUP' not found"
    fi
done
echo ""

# Check metric filters
echo "7. Checking metric filters..."
METRIC_FILTERS=(
    "/aws/apigateway/office-lease-api:ApiClientErrorMetric"
    "/aws/apigateway/office-lease-api:ApiServerErrorMetric"
    "/aws/lambda/office-lease-api:LambdaErrorMetric"
    "/aws/lambda/office-lease-api:DatabaseConnectionErrorMetric"
)

for FILTER in "${METRIC_FILTERS[@]}"; do
    LOG_GROUP="${FILTER%%:*}"
    FILTER_NAME="${FILTER##*:}"
    
    if aws logs describe-metric-filters \
        --log-group-name $LOG_GROUP \
        --region $REGION \
        --query "metricFilters[?filterName=='$FILTER_NAME']" \
        --output text &> /dev/null; then
        echo "   ✅ Metric filter '$FILTER_NAME' exists in '$LOG_GROUP'"
    else
        echo "   ⚠️  Metric filter '$FILTER_NAME' not found in '$LOG_GROUP'"
    fi
done
echo ""

# Summary
echo "========================================="
echo "Verification Summary"
echo "========================================="
echo ""
echo "Dashboard URL:"
echo "$DASHBOARD_URL"
echo ""
echo "To view alarms:"
echo "aws cloudwatch describe-alarms --region $REGION --output table"
echo ""
echo "To test an alarm (API error rate):"
echo "# This will trigger the alarm if you generate enough errors"
echo "for i in {1..20}; do curl -X GET $API_URL/invalid-endpoint; done"
echo ""
echo "To add email notification:"
echo "aws sns subscribe --topic-arn $ALARM_TOPIC_ARN --protocol email --notification-endpoint your-email@example.com"
echo ""
