# Deployment Runbook

Step-by-step guide for deploying the Office Lease Database system.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Phase 1: Infrastructure Deployment](#phase-1-infrastructure-deployment)
3. [Phase 2: Database Schema Setup](#phase-2-database-schema-setup)
4. [Phase 3: Data Loading](#phase-3-data-loading)
5. [Phase 4: Verification](#phase-4-verification)
6. [Phase 5: Monitoring Setup](#phase-5-monitoring-setup)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Prerequisites

- [ ] Node.js 18+ installed
- [ ] npm installed
- [ ] AWS CLI installed and configured
- [ ] AWS CDK CLI installed (`npm install -g aws-cdk`)
- [ ] Flyway installed (for database migrations)
- [ ] PostgreSQL client installed (psql)
- [ ] jq installed (for JSON parsing)

### AWS Account Setup

- [ ] AWS account created
- [ ] IAM user created with appropriate permissions
- [ ] AWS credentials configured (`aws configure`)
- [ ] Default region set (e.g., us-east-1)
- [ ] Account limits checked (VPC, RDS, Lambda)

### Permissions Required

The deploying IAM user/role needs:
- CloudFormation (full)
- VPC (create/modify)
- RDS (full)
- Lambda (full)
- API Gateway (full)
- IAM (create roles/policies)
- Secrets Manager (full)
- KMS (create/use keys)
- CloudWatch (full)
- SNS (create topics/subscriptions)

### Cost Estimate

**Development Environment:**
- Aurora Serverless v2: $30-50/month
- RDS Proxy: $11/month
- NAT Gateway: $33/month + data transfer
- Lambda: $5-10/month
- API Gateway: $3-5/month
- Other services: $5-10/month
- **Total: ~$90-120/month**

**Production Environment:**
- Aurora Serverless v2: $100-300/month
- RDS Proxy: $11/month
- NAT Gateway: $33/month + data transfer
- Lambda: $20-50/month
- API Gateway: $10-20/month
- Other services: $10-20/month
- **Total: ~$185-435/month**

---

## Phase 1: Infrastructure Deployment

### Step 1.1: Clone Repository

```bash
git clone <repository-url>
cd office-lease-database
```

### Step 1.2: Install Dependencies

```bash
npm install
```

**Expected output:**
```
added 150 packages in 15s
```

### Step 1.3: Configure Environment

Set optional environment variables:

```bash
# Optional: Email for alarm notifications
export ALARM_EMAIL=your-email@example.com

# Optional: Custom region (default: us-east-1)
export AWS_REGION=us-east-1
```

### Step 1.4: Bootstrap CDK (First Time Only)

If this is your first CDK deployment in this region:

```bash
cdk bootstrap aws://<account-id>/<region>
```

**Expected output:**
```
✅  Environment aws://<account-id>/<region> bootstrapped
```

### Step 1.5: Review Infrastructure Code

Review the CDK stack definition:

```bash
cat infrastructure/app.ts
cat infrastructure/lease-database-stack.ts
```

### Step 1.6: Synthesize CloudFormation Template

Generate the CloudFormation template:

```bash
cdk synth
```

**Expected output:**
```
Successfully synthesized to cdk.out/OfficeLeaseDatabaseStack.template.json
```

### Step 1.7: Deploy Infrastructure

Run the deployment script:

```bash
cd infrastructure
./deploy.sh
```

**Deployment time:** 15-25 minutes (Aurora cluster creation is slow)

**What gets deployed:**
- VPC with public, private, and database subnets
- NAT Gateway for private subnet internet access
- Aurora PostgreSQL Serverless v2 cluster (2 instances for HA)
- RDS Proxy for connection pooling
- 13 Lambda functions for API endpoints
- API Gateway HTTP API
- Lambda authorizer for IAM authentication
- IAM roles (lease_app_rw, analyst_ro, admin_dba)
- Secrets Manager secret for database credentials
- KMS keys for encryption
- CloudWatch dashboards and alarms
- SNS topic for alarm notifications

### Step 1.8: Verify Deployment

Check CloudFormation stack status:

```bash
aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].StackStatus' \
  --output text
```

**Expected output:** `CREATE_COMPLETE`

### Step 1.9: Retrieve Stack Outputs

Get important endpoints and ARNs:

```bash
aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs' \
  --output table
```

**Key outputs:**
- `ApiGatewayUrl`: REST API endpoint
- `DatabaseProxyEndpoint`: RDS Proxy endpoint
- `DatabaseSecretArn`: Secrets Manager ARN
- `AlarmTopicArn`: SNS topic for alarms
- `DashboardUrl`: CloudWatch dashboard URL

### Step 1.10: Confirm Email Subscription (If Configured)

If you set `ALARM_EMAIL`, check your email for SNS confirmation:

1. Open the email from AWS Notifications
2. Click "Confirm subscription"
3. Verify confirmation in AWS Console

---

## Phase 2: Database Schema Setup

### Step 2.1: Verify Database Connectivity

Test connection to the database:

```bash
# Get database credentials
DB_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
  --output text)

DB_CREDS=$(aws secretsmanager get-secret-value \
  --secret-id $DB_SECRET_ARN \
  --query SecretString \
  --output text)

DB_USER=$(echo $DB_CREDS | jq -r .username)
DB_PASS=$(echo $DB_CREDS | jq -r .password)
DB_HOST=$(echo $DB_CREDS | jq -r .host)
DB_NAME=$(echo $DB_CREDS | jq -r .dbname)

# Test connection
PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT version();"
```

**Note:** This requires network access to the VPC. Options:
- Run from a bastion host in the VPC
- Use AWS Systems Manager Session Manager
- Set up VPN connection to the VPC
- Use AWS Cloud9 environment in the VPC

### Step 2.2: Review Migration Files

Check the migration files:

```bash
ls -la schema/migrations/
```

**Expected files:**
- `V001__create_core_tables.sql`
- `V002__create_lease_detail_tables.sql`
- `V003__create_option_concession_date_doc_tables.sql`
- `V004__create_indexes.sql`
- `V005__create_views.sql`

### Step 2.3: Run Migrations

Execute database migrations using Flyway:

```bash
cd schema
./run-migrations.sh
```

**Expected output:**
```
[INFO] Checking current migration status...
[INFO] Executing migrations...
[SUCCESS] Migrations completed successfully!
```

**What gets created:**
- 11 core tables (property, suite, party, lease, etc.)
- Foreign key constraints
- Unique constraints
- Check constraints
- GIST indexes on date ranges
- B-tree indexes on foreign keys
- 9 reporting views

### Step 2.4: Verify Schema

Check that all tables were created:

```bash
PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "\dt"
```

**Expected tables:**
```
 property
 suite
 party
 lease
 lease_version
 rent_schedule
 opex_pass_through
 option
 concession
 critical_date
 doc_link
```

Check that all views were created:

```bash
PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "\dv"
```

**Expected views:**
```
 vw_current_lease
 vw_lease_expiration
 vw_expirations
 vw_rent_roll_current
 vw_options_status
 vw_free_rent_status
 vw_ti_allowance_summary
 vw_critical_dates_upcoming
 vw_amendment_history
```

### Step 2.5: Run Constraint Validation Tests

Verify that constraints are working:

```bash
PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -f schema/migrations/tests/constraint_validation_tests.sql
```

**Expected output:**
```
All constraint tests passed!
```

---

## Phase 3: Data Loading

### Step 3.1: Review Seed Data Script

Check the seed data configuration:

```bash
cat schema/seed-data.js
cat schema/SEED-DATA-README.md
```

### Step 3.2: Load Seed Data

Run the seed data script:

```bash
cd schema
./load-seed-data.sh
```

**Expected output:**
```
[INFO] Loading seed data...
[SUCCESS] Created 50 properties
[SUCCESS] Created 150 suites
[SUCCESS] Created 100 parties
[SUCCESS] Created 300 leases
[SUCCESS] Seed data loaded successfully!
```

**What gets created:**
- 50 properties across various cities
- 150 suites (3 per property on average)
- 100 parties (60 tenants, 40 landlords)
- 300 leases with initial versions
- 450 lease versions (including amendments)
- 900 rent schedule periods
- 200 options (renewal, termination, expansion)
- 150 concessions (TI allowances, free rent)
- 600 critical dates
- 300 document links

### Step 3.3: Verify Data

Check record counts:

```bash
PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME << EOF
SELECT 'properties' as table_name, COUNT(*) as count FROM property
UNION ALL
SELECT 'suites', COUNT(*) FROM suite
UNION ALL
SELECT 'parties', COUNT(*) FROM party
UNION ALL
SELECT 'leases', COUNT(*) FROM lease
UNION ALL
SELECT 'lease_versions', COUNT(*) FROM lease_version
UNION ALL
SELECT 'rent_schedules', COUNT(*) FROM rent_schedule
ORDER BY table_name;
EOF
```

---

## Phase 4: Verification

### Step 4.1: Test API Endpoints

Get the API URL:

```bash
API_URL=$(aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text)

echo "API URL: $API_URL"
```

Test the properties endpoint:

```bash
curl -X GET "$API_URL/properties" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
```

**Expected response:**
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": { ... }
}
```

### Step 4.2: Test Report Endpoints

Test the expirations report:

```bash
curl -X GET "$API_URL/reports/expirations?months=12" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
```

Test the rent roll report:

```bash
curl -X GET "$API_URL/reports/rent-roll" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
```

### Step 4.3: Test Authorization

Test with read-only role (should succeed):

```bash
# Assume analyst_ro role
aws sts assume-role \
  --role-arn arn:aws:iam::<account-id>:role/analyst_ro \
  --role-session-name test-session

# Use temporary credentials to test GET
curl -X GET "$API_URL/properties" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
```

Test with read-only role (should fail):

```bash
# Try to create a property (should return 403)
curl -X POST "$API_URL/properties" \
  -H "Content-Type: application/json" \
  -d '{"property_name":"Test"}' \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
```

### Step 4.4: Test Natural Language Query

Test the NLQ endpoint:

```bash
curl -X POST "$API_URL/query/natural-language" \
  -H "Content-Type: application/json" \
  -d '{"query":"Show me leases expiring in the next 6 months"}' \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
```

### Step 4.5: Test Batch Operations

Test batch property creation:

```bash
curl -X POST "$API_URL/batch/properties" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": [
      {"property_name":"Batch Test 1","address":"123 Test St","city":"Test City","state_province":"CA","postal_code":"12345","country":"USA"},
      {"property_name":"Batch Test 2","address":"456 Test Ave","city":"Test City","state_province":"CA","postal_code":"12345","country":"USA"}
    ]
  }' \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
```

### Step 4.6: Run API Gateway Tests

Run the comprehensive test script:

```bash
cd infrastructure
./test-api-gateway.sh
```

**Expected output:**
```
[SUCCESS] All API tests passed!
```

---

## Phase 5: Monitoring Setup

### Step 5.1: Access CloudWatch Dashboard

Open the CloudWatch dashboard:

```bash
DASHBOARD_URL=$(aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text)

echo "Dashboard URL: $DASHBOARD_URL"
```

Open in browser or use AWS Console:
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:
```

### Step 5.2: Verify Alarms

List all alarms:

```bash
aws cloudwatch describe-alarms \
  --alarm-name-prefix "OfficeLease" \
  --query 'MetricAlarms[*].[AlarmName,StateValue]' \
  --output table
```

**Expected alarms:**
- `OfficeLease-ApiErrorRate`: API error rate > 5%
- `OfficeLease-DatabaseCPU`: Database CPU > 80%
- `OfficeLease-LambdaErrors`: Lambda errors > 10
- `OfficeLease-DatabaseConnections`: Connections > 90%

All alarms should be in `OK` state initially.

### Step 5.3: Test Alarm Notifications

Trigger a test alarm:

```bash
aws cloudwatch set-alarm-state \
  --alarm-name "OfficeLease-ApiErrorRate" \
  --state-value ALARM \
  --state-reason "Testing alarm notification"
```

Check your email for notification (if configured).

Reset the alarm:

```bash
aws cloudwatch set-alarm-state \
  --alarm-name "OfficeLease-ApiErrorRate" \
  --state-value OK \
  --state-reason "Test complete"
```

### Step 5.4: Verify Monitoring Script

Run the monitoring verification script:

```bash
cd infrastructure
./verify-monitoring.sh
```

**Expected output:**
```
[SUCCESS] All monitoring components verified!
```

### Step 5.5: Review CloudWatch Logs

Check Lambda function logs:

```bash
aws logs tail /aws/lambda/lease-api-properties --follow
```

Check API Gateway logs:

```bash
aws logs tail /aws/apigateway/OfficeLeaseDatabaseApi --follow
```

---

## Rollback Procedures

### Rollback Phase 3: Data Loading

**Scenario:** Seed data was loaded incorrectly or needs to be reset.

**Steps:**

1. Connect to the database:
```bash
PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME
```

2. Delete all data (preserves schema):
```sql
-- Disable triggers temporarily
SET session_replication_role = 'replica';

-- Delete in reverse dependency order
TRUNCATE TABLE doc_link CASCADE;
TRUNCATE TABLE critical_date CASCADE;
TRUNCATE TABLE concession CASCADE;
TRUNCATE TABLE option CASCADE;
TRUNCATE TABLE opex_pass_through CASCADE;
TRUNCATE TABLE rent_schedule CASCADE;
TRUNCATE TABLE lease_version CASCADE;
TRUNCATE TABLE lease CASCADE;
TRUNCATE TABLE suite CASCADE;
TRUNCATE TABLE party CASCADE;
TRUNCATE TABLE property CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';
```

3. Reload seed data:
```bash
cd schema
./load-seed-data.sh
```

**Time required:** 5-10 minutes

**Risk level:** Low (schema preserved, only data affected)

---

### Rollback Phase 2: Database Schema

**Scenario:** Migration failed or schema needs to be reset.

**Steps:**

1. Drop all views:
```sql
DROP VIEW IF EXISTS vw_opex_summary CASCADE;
DROP VIEW IF EXISTS vw_amendment_history CASCADE;
DROP VIEW IF EXISTS vw_critical_dates_upcoming CASCADE;
DROP VIEW IF EXISTS vw_ti_allowance_summary CASCADE;
DROP VIEW IF EXISTS vw_free_rent_status CASCADE;
DROP VIEW IF EXISTS vw_options_status CASCADE;
DROP VIEW IF EXISTS vw_rent_roll_current CASCADE;
DROP VIEW IF EXISTS vw_expirations CASCADE;
DROP VIEW IF EXISTS vw_lease_expiration CASCADE;
DROP VIEW IF EXISTS vw_current_lease CASCADE;
```

2. Drop all tables:
```sql
DROP TABLE IF EXISTS doc_link CASCADE;
DROP TABLE IF EXISTS critical_date CASCADE;
DROP TABLE IF EXISTS concession CASCADE;
DROP TABLE IF EXISTS option CASCADE;
DROP TABLE IF EXISTS opex_pass_through CASCADE;
DROP TABLE IF EXISTS rent_schedule CASCADE;
DROP TABLE IF EXISTS lease_version CASCADE;
DROP TABLE IF EXISTS lease CASCADE;
DROP TABLE IF EXISTS suite CASCADE;
DROP TABLE IF EXISTS party CASCADE;
DROP TABLE IF EXISTS property CASCADE;
```

3. Drop Flyway schema history:
```sql
DROP TABLE IF EXISTS flyway_schema_history CASCADE;
```

4. Re-run migrations:
```bash
cd schema
./run-migrations.sh
```

**Time required:** 10-15 minutes

**Risk level:** Medium (all data will be lost)

**Alternative:** Use Flyway's undo migrations if available:
```bash
flyway undo -url="$JDBC_URL" -user="$DB_USER" -password="$DB_PASS"
```

---

### Rollback Phase 1: Infrastructure

**Scenario:** Infrastructure deployment failed or needs to be completely removed.

**Option 1: Delete Stack (Complete Removal)**

1. Delete the CloudFormation stack:
```bash
aws cloudformation delete-stack --stack-name OfficeLeaseDatabaseStack
```

2. Wait for deletion to complete:
```bash
aws cloudformation wait stack-delete-complete --stack-name OfficeLeaseDatabaseStack
```

3. Verify deletion:
```bash
aws cloudformation describe-stacks --stack-name OfficeLeaseDatabaseStack
```

**Expected output:** `Stack with id OfficeLeaseDatabaseStack does not exist`

**Time required:** 15-20 minutes

**Risk level:** High (all resources and data will be deleted)

**What gets deleted:**
- All Lambda functions
- API Gateway
- RDS Proxy
- Aurora cluster (including all data)
- VPC and networking components
- IAM roles and policies
- Secrets Manager secrets
- CloudWatch dashboards and alarms
- SNS topics

**What is NOT deleted (manual cleanup required):**
- CloudWatch log groups (retained for 30 days by default)
- S3 buckets (if any were created)
- KMS keys (scheduled for deletion after 7-30 days)

**Option 2: Update Stack (Partial Rollback)**

If you need to rollback to a previous version:

1. Get the previous template:
```bash
aws cloudformation get-template \
  --stack-name OfficeLeaseDatabaseStack \
  --template-stage Original \
  > previous-template.json
```

2. Update the stack:
```bash
cdk deploy --previous-parameters
```

**Option 3: Manual Resource Cleanup**

If stack deletion fails, manually delete resources:

1. Delete Lambda functions:
```bash
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `lease-api`)].FunctionName' --output text | \
  xargs -I {} aws lambda delete-function --function-name {}
```

2. Delete API Gateway:
```bash
API_ID=$(aws apigatewayv2 get-apis --query 'Items[?Name==`OfficeLeaseDatabaseApi`].ApiId' --output text)
aws apigatewayv2 delete-api --api-id $API_ID
```

3. Delete RDS Proxy:
```bash
aws rds delete-db-proxy --db-proxy-name office-lease-db-proxy
```

4. Delete Aurora cluster:
```bash
aws rds delete-db-cluster \
  --db-cluster-identifier office-lease-db-cluster \
  --skip-final-snapshot
```

5. Delete VPC (after all resources are removed):
```bash
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=OfficeLeaseDatabaseVPC" --query 'Vpcs[0].VpcId' --output text)
aws ec2 delete-vpc --vpc-id $VPC_ID
```

---

### Emergency Rollback Checklist

Use this checklist for emergency rollbacks:

**Immediate Actions:**
- [ ] Stop all incoming traffic (disable API Gateway)
- [ ] Notify stakeholders
- [ ] Take database snapshot
- [ ] Document the issue

**Rollback Execution:**
- [ ] Determine rollback scope (data, schema, or infrastructure)
- [ ] Execute appropriate rollback procedure
- [ ] Verify rollback success
- [ ] Test critical functionality

**Post-Rollback:**
- [ ] Re-enable traffic (if applicable)
- [ ] Monitor for issues
- [ ] Document root cause
- [ ] Plan remediation

---

## Troubleshooting

### Issue: CDK Bootstrap Fails

**Symptoms:**
```
Error: This stack uses assets, so the toolkit stack must be deployed
```

**Solution:**
```bash
cdk bootstrap aws://<account-id>/<region>
```

---

### Issue: Aurora Cluster Creation Timeout

**Symptoms:**
```
Resource creation cancelled
Timeout waiting for Aurora cluster
```

**Solution:**
1. Check CloudFormation events for details
2. Verify account limits for RDS instances
3. Try deploying in a different region
4. Increase timeout in CDK stack (if applicable)

---

### Issue: Cannot Connect to Database

**Symptoms:**
```
psql: could not connect to server: Connection timed out
```

**Solution:**
1. Verify you're connecting from within the VPC or through a bastion host
2. Check security group rules
3. Verify RDS Proxy is running
4. Check VPC routing tables

---

### Issue: Migration Fails with Constraint Violation

**Symptoms:**
```
ERROR: duplicate key value violates unique constraint
```

**Solution:**
1. Check if data already exists in tables
2. Review migration order
3. Drop and recreate schema if necessary
4. Ensure Flyway schema history is correct

---

### Issue: API Returns 403 Forbidden

**Symptoms:**
```json
{
  "message": "Forbidden"
}
```

**Solution:**
1. Verify IAM credentials are configured
2. Check IAM role has necessary permissions
3. Verify Lambda authorizer is working
4. Check CloudWatch logs for authorization errors

---

### Issue: Lambda Function Timeout

**Symptoms:**
```
Task timed out after 30.00 seconds
```

**Solution:**
1. Increase Lambda timeout in CDK stack
2. Optimize database queries
3. Check database connection pooling
4. Review CloudWatch logs for slow queries

---

### Issue: High Database CPU Usage

**Symptoms:**
- CloudWatch alarm triggered
- Slow API responses

**Solution:**
1. Check for missing indexes
2. Review slow query log
3. Increase Aurora ACU capacity
4. Optimize queries in Lambda functions

---

### Issue: Seed Data Script Fails

**Symptoms:**
```
Error: Connection refused
Error: Foreign key constraint violation
```

**Solution:**
1. Verify database is accessible
2. Ensure migrations completed successfully
3. Check database credentials
4. Review seed data script for errors

---

### Issue: CloudWatch Dashboard Not Showing Data

**Symptoms:**
- Dashboard widgets show "No data"

**Solution:**
1. Wait 5-10 minutes for metrics to populate
2. Verify Lambda functions are being invoked
3. Check metric filters are configured correctly
4. Verify CloudWatch Logs are being created

---

### Getting Help

**CloudFormation Console:**
```
https://console.aws.amazon.com/cloudformation/home?region=us-east-1
```

**CloudWatch Logs:**
```bash
aws logs tail /aws/lambda/lease-api-properties --follow
```

**RDS Console:**
```
https://console.aws.amazon.com/rds/home?region=us-east-1
```

**Support Resources:**
- AWS Support Center
- CloudFormation stack events
- CloudWatch Logs Insights
- RDS Performance Insights

---

## Appendix: Environment-Specific Configurations

### Development Environment

```bash
export ENVIRONMENT=dev
export ALARM_EMAIL=dev-team@example.com
export AWS_REGION=us-east-1
export DB_MIN_CAPACITY=0.5  # ACU
export DB_MAX_CAPACITY=2    # ACU
```

### Staging Environment

```bash
export ENVIRONMENT=staging
export ALARM_EMAIL=staging-alerts@example.com
export AWS_REGION=us-east-1
export DB_MIN_CAPACITY=1    # ACU
export DB_MAX_CAPACITY=4    # ACU
```

### Production Environment

```bash
export ENVIRONMENT=prod
export ALARM_EMAIL=prod-alerts@example.com
export AWS_REGION=us-east-1
export DB_MIN_CAPACITY=2    # ACU
export DB_MAX_CAPACITY=8    # ACU
export ENABLE_MULTI_AZ=true
export BACKUP_RETENTION_DAYS=30
```

---

## Appendix: Useful Commands

### Check Stack Status
```bash
aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].StackStatus'
```

### Get All Stack Outputs
```bash
aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs'
```

### View Recent CloudWatch Logs
```bash
aws logs tail /aws/lambda/lease-api-properties --since 1h
```

### Check Database Connections
```bash
PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -c "SELECT count(*) FROM pg_stat_activity;"
```

### List All Lambda Functions
```bash
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `lease-api`)].FunctionName'
```

### Check API Gateway Metrics
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiId,Value=$API_ID \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

---

**Document Version:** 1.0  
**Last Updated:** 2024-01-15  
**Maintained By:** DevOps Team
