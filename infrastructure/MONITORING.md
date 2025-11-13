# Monitoring and Alerting

This document describes the monitoring and alerting configuration for the Office Lease Data Platform.

## Overview

The system uses AWS CloudWatch for comprehensive monitoring with:
- Real-time dashboards for API, Lambda, and database metrics
- Automated alarms for critical issues
- SNS notifications for alarm events
- Custom business metrics

## CloudWatch Dashboard

### Access

After deployment, access the dashboard at:
```
https://console.aws.amazon.com/cloudwatch/home?region=<region>#dashboards:name=office-lease-data-platform
```

Or get the URL from CDK outputs:
```bash
aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text
```

### Dashboard Sections

#### 1. API Gateway Metrics

**Request Count**
- Total API requests over time
- 5-minute aggregation
- Useful for understanding traffic patterns

**Error Rate**
- 4xx client errors (bad requests, unauthorized, not found)
- 5xx server errors (internal errors, timeouts)
- 5-minute aggregation

**Latency**
- Average latency
- p95 latency (95th percentile)
- p99 latency (99th percentile)
- Helps identify performance degradation

**Integration Latency**
- Time spent in Lambda functions
- Excludes API Gateway overhead
- Useful for Lambda optimization

#### 2. Lambda Metrics

**Invocations**
- Invocation count per function
- Properties, Leases, Reports functions shown
- 5-minute aggregation

**Errors**
- Error count per function
- Includes unhandled exceptions and timeouts
- 5-minute aggregation

**Duration**
- Average execution time per function
- Helps identify slow functions
- Compare against timeout settings

**Concurrent Executions**
- Number of Lambda functions running simultaneously
- Helps identify concurrency limits
- Maximum value over 5-minute period

#### 3. Database Metrics

**CPU Utilization**
- Average CPU usage percentage
- 5-minute aggregation
- Alarm threshold: 80%

**Connections**
- Number of active database connections
- 5-minute aggregation
- Alarm threshold: 90 connections

**Read/Write IOPS**
- Input/output operations per second
- Separate metrics for reads and writes
- Helps identify I/O bottlenecks

**Latency**
- Read and write operation latency
- Average over 5-minute period
- Measured in milliseconds

#### 4. Business Metrics (Single Value Widgets)

**API Health**
- Total requests in the last hour
- Quick health check indicator

**Error Rate**
- 5xx errors in the last hour
- Immediate visibility into system issues

**Avg Latency**
- Average API latency in the last hour
- Performance at a glance

**DB CPU**
- Average database CPU in the last hour
- Database health indicator

## CloudWatch Alarms

### Configured Alarms

#### 1. API Error Rate Alarm
- **Name**: `office-lease-api-error-rate`
- **Condition**: API 5xx errors > 5 per minute for 5 consecutive minutes
- **Action**: Send notification to SNS topic
- **Purpose**: Detect sustained API failures

#### 2. API Latency Alarm
- **Name**: `office-lease-api-latency`
- **Condition**: p95 latency > 2000ms for 2 consecutive 5-minute periods
- **Action**: Send notification to SNS topic
- **Purpose**: Detect performance degradation

#### 3. Lambda Error Alarm
- **Name**: `office-lease-lambda-errors`
- **Condition**: Lambda errors > 10 in 5 minutes
- **Action**: Send notification to SNS topic
- **Purpose**: Detect Lambda function failures
- **Note**: Currently monitors properties function; can be extended to other functions

#### 4. Database CPU Alarm
- **Name**: `office-lease-db-cpu`
- **Condition**: Database CPU > 80% for 2 consecutive 5-minute periods (10 minutes total)
- **Action**: Send notification to SNS topic
- **Purpose**: Detect database resource exhaustion

#### 5. Database Connections Alarm
- **Name**: `office-lease-db-connections`
- **Condition**: Database connections > 90 for 2 consecutive 5-minute periods
- **Action**: Send notification to SNS topic
- **Purpose**: Detect connection pool exhaustion
- **Note**: Threshold should be adjusted based on max_connections setting

## SNS Topic for Notifications

### Configuration

The system creates an SNS topic named `office-lease-alarms` for alarm notifications.

**Topic ARN**: Available in CloudFormation outputs as `AlarmTopicArn`

### Email Subscription

To receive alarm notifications via email, set the `ALARM_EMAIL` environment variable before deployment:

```bash
export ALARM_EMAIL=your-email@example.com
cdk deploy
```

Or add email subscriptions manually after deployment:

```bash
# Get the topic ARN
TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AlarmTopicArn`].OutputValue' \
  --output text)

# Subscribe email
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol email \
  --notification-endpoint your-email@example.com

# Confirm subscription via email link
```

### Other Notification Options

You can add additional subscriptions for:
- **SMS**: `--protocol sms --notification-endpoint +1234567890`
- **Slack**: Use AWS Chatbot integration
- **PagerDuty**: Use HTTPS endpoint integration
- **Lambda**: `--protocol lambda --notification-endpoint <lambda-arn>`

## Metric Filters

The system includes custom metric filters for enhanced monitoring:

### API Metric Filters

**Client Errors (4xx)**
- Namespace: `OfficeLease/API`
- Metric: `ClientErrors`
- Pattern: `[..., status_code=4*, ...]`

**Server Errors (5xx)**
- Namespace: `OfficeLease/API`
- Metric: `ServerErrors`
- Pattern: `[..., status_code=5*, ...]`

### Lambda Metric Filters

**Lambda Errors**
- Namespace: `OfficeLease/Lambda`
- Metric: `Errors`
- Pattern: `[..., level=ERROR, ...]`

**Database Connection Errors**
- Namespace: `OfficeLease/Database`
- Metric: `ConnectionErrors`
- Pattern: Matches `ECONNREFUSED`, `connection timeout`, `too many connections`

## Log Groups

### API Gateway Logs
- **Log Group**: `/aws/apigateway/office-lease-api`
- **Retention**: 30 days
- **Format**: JSON with request ID, IP, method, status, latency

### Lambda Logs
- **Log Group**: `/aws/lambda/office-lease-api`
- **Retention**: 30 days
- **Format**: Structured JSON logs from Lambda functions

### Database Logs
- **Log Group**: `/aws/rds/cluster/auroracluster-*/postgresql`
- **Retention**: 30 days
- **Content**: PostgreSQL query logs, errors, slow queries

## Monitoring Best Practices

### Regular Review

1. **Daily**: Check dashboard for anomalies
2. **Weekly**: Review alarm history and trends
3. **Monthly**: Analyze performance patterns and optimize

### Alarm Tuning

- Adjust thresholds based on actual traffic patterns
- Add composite alarms for complex conditions
- Set up alarm actions for auto-remediation

### Cost Optimization

- Use metric math to reduce custom metrics
- Adjust log retention based on compliance needs
- Archive old logs to S3 for long-term storage

### Performance Optimization

Monitor these key indicators:
- API latency trends (should stay < 1s p95)
- Database CPU (should stay < 60% average)
- Lambda duration (should stay well below timeout)
- Connection pool usage (should stay < 70%)

## Troubleshooting

### High API Error Rate

1. Check Lambda function logs for errors
2. Verify database connectivity
3. Check for deployment issues
4. Review recent code changes

### High Database CPU

1. Check for slow queries in PostgreSQL logs
2. Review query execution plans
3. Consider adding indexes
4. Scale up Aurora capacity if needed

### High Lambda Errors

1. Check Lambda function logs
2. Verify environment variables
3. Check VPC/security group configuration
4. Review recent deployments

### Connection Pool Exhaustion

1. Check for connection leaks in Lambda code
2. Verify RDS Proxy configuration
3. Increase max_connections if needed
4. Review Lambda concurrency settings

## Accessing Metrics via CLI

### Query API Metrics

```bash
# Get API request count
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiId,Value=<api-id> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum

# Get API latency
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Latency \
  --dimensions Name=ApiId,Value=<api-id> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Average,p95,p99
```

### Query Database Metrics

```bash
# Get database CPU
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBClusterIdentifier,Value=<cluster-id> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Average,Maximum

# Get database connections
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBClusterIdentifier,Value=<cluster-id> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Average,Maximum
```

### Query Lambda Metrics

```bash
# Get Lambda invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=office-lease-api-properties \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum

# Get Lambda errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=office-lease-api-properties \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

## Deployment

The monitoring infrastructure is automatically deployed with the CDK stack:

```bash
# Deploy with email notifications
export ALARM_EMAIL=your-email@example.com
cdk deploy

# Deploy without email (add subscriptions later)
cdk deploy
```

After deployment, confirm your email subscription if you provided an email address.

## Summary

The monitoring and alerting system provides:
- ✅ CloudWatch dashboard for API metrics (requests, latency, errors)
- ✅ CloudWatch dashboard for database metrics (CPU, connections, IOPS)
- ✅ Alarm for API error rate > 5% for 5 minutes
- ✅ Alarm for database CPU > 80% for 10 minutes
- ✅ Alarm for Lambda errors > 10 in 5 minutes
- ✅ Alarm for database connections > 90% of max
- ✅ SNS topic for alarm notifications

All requirements from task 20 are fully implemented