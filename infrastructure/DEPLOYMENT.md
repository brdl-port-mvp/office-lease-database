# Deployment Guide

This guide walks through deploying the Office Lease Database infrastructure to AWS.

## Prerequisites Checklist

- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] AWS CLI installed and configured (`aws --version`)
- [ ] AWS credentials configured (`aws sts get-caller-identity`)
- [ ] AWS CDK CLI installed (`npm install -g aws-cdk`)
- [ ] Appropriate AWS permissions (VPC, RDS, IAM, Secrets Manager, KMS, CloudWatch)

## Step-by-Step Deployment

### 1. Install Dependencies

```bash
cd /path/to/office-lease-database
npm install
```

This installs:
- `aws-cdk-lib`: CDK framework
- `constructs`: CDK constructs library
- TypeScript and type definitions

### 2. Configure AWS Credentials

Ensure your AWS credentials are configured:

```bash
# Check current identity
aws sts get-caller-identity

# If not configured, set up credentials
aws configure
```

You'll need:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., us-east-1)

### 3. Bootstrap CDK (First Time Only)

If this is your first CDK deployment in this AWS account/region:

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

Example:
```bash
cdk bootstrap aws://123456789012/us-east-1
```

This creates:
- S3 bucket for CDK assets
- IAM roles for CloudFormation
- ECR repository for container images

### 4. Review the Stack

Synthesize the CloudFormation template to review what will be created:

```bash
npm run synth
# or
cdk synth
```

This generates a CloudFormation template in `cdk.out/OfficeLeaseDatabaseStack.template.json`

Review the template to understand:
- Resources being created
- IAM permissions
- Estimated costs

### 5. Deploy the Stack

Deploy the infrastructure:

```bash
npm run deploy
# or
cdk deploy
```

You'll see:
1. List of resources to be created
2. IAM policy changes (if any)
3. Prompt to confirm deployment

Type `y` to proceed.

**Deployment time**: 15-25 minutes (Aurora cluster creation is slow)

### 6. Capture Outputs

After deployment completes, save the stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs' \
  --output table
```

Key outputs to save:
- `OfficeLease-DbProxyEndpoint`: Use this for Lambda connections
- `OfficeLease-DbSecretArn`: Database credentials location
- `OfficeLease-LeaseAppRwRoleArn`: Role for application Lambdas
- `OfficeLease-LambdaSecurityGroupId`: Security group for Lambdas

### 7. Verify Deployment

Check that resources were created successfully:

```bash
# Check Aurora cluster status
aws rds describe-db-clusters \
  --db-cluster-identifier officeleasedatabasestack-auroracluster* \
  --query 'DBClusters[0].Status'

# Check RDS Proxy status
aws rds describe-db-proxies \
  --db-proxy-name office-lease-db-proxy \
  --query 'DBProxies[0].Status'

# Check Secrets Manager secret
aws secretsmanager describe-secret \
  --secret-id $(aws cloudformation describe-stacks \
    --stack-name OfficeLeaseDatabaseStack \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
    --output text)
```

All should return "available" or "active" status.

### 8. Test Database Connection

Connect to the database using the RDS Proxy endpoint:

```bash
# Get database credentials
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
  --output text)

DB_CREDS=$(aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query SecretString \
  --output text)

DB_USER=$(echo $DB_CREDS | jq -r .username)
DB_PASS=$(echo $DB_CREDS | jq -r .password)

# Get proxy endpoint
PROXY_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseProxyEndpoint`].OutputValue' \
  --output text)

# Connect using psql (requires psql client and bastion host or VPN)
psql -h $PROXY_ENDPOINT -U $DB_USER -d officeLeaseDB
```

**Note**: Direct connection requires network access to the VPC. You may need:
- Bastion host in public subnet
- VPN connection to VPC
- AWS Systems Manager Session Manager

## Post-Deployment Tasks

### 1. Run Database Migrations

After infrastructure is deployed, run Flyway migrations:

```bash
# From project root
cd schema/migrations
# Run Flyway (see schema/migrations/README.md)
```

### 2. Configure IAM Users

Grant IAM users access to analyst_ro or admin_dba roles:

```bash
# Allow user to assume analyst_ro role
aws iam attach-user-policy \
  --user-name analyst-user \
  --policy-arn arn:aws:iam::ACCOUNT-ID:policy/AssumeAnalystRoRole
```

### 3. Set Up Monitoring

Create CloudWatch dashboard:

```bash
# Use AWS Console or CLI to create dashboard
# Include metrics for:
# - Aurora CPU, connections, IOPS
# - RDS Proxy connections
# - Lambda invocations, errors, duration
```

### 4. Configure Alarms

Set up CloudWatch alarms (see Task 20):

```bash
# Example: Alarm for high database CPU
aws cloudwatch put-metric-alarm \
  --alarm-name lease-db-high-cpu \
  --alarm-description "Alert when Aurora CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

## Updating the Stack

To update the infrastructure after making changes:

```bash
# Review changes
cdk diff

# Deploy updates
cdk deploy
```

CDK will show you what will change before applying updates.

## Rolling Back

If deployment fails or you need to rollback:

```bash
# Rollback to previous version
aws cloudformation rollback-stack \
  --stack-name OfficeLeaseDatabaseStack

# Or delete and redeploy
cdk destroy
cdk deploy
```

**Warning**: Destroying the stack will delete the database. Use snapshots for production.

## Troubleshooting

### Error: "CDK bootstrap required"

**Solution**: Run `cdk bootstrap` in your account/region

### Error: "Insufficient permissions"

**Solution**: Ensure your IAM user/role has permissions for:
- CloudFormation (full)
- VPC (create/modify)
- RDS (full)
- IAM (create roles/policies)
- Secrets Manager (create/read)
- KMS (create/use keys)
- CloudWatch Logs (create/write)

### Error: "VPC limit exceeded"

**Solution**: Delete unused VPCs or request limit increase

### Aurora cluster stuck in "creating" state

**Solution**: Wait 15-20 minutes. Aurora cluster creation is slow.

### Cannot connect to database

**Possible causes**:
1. Security groups blocking traffic
2. Using cluster endpoint instead of proxy endpoint
3. No network path to VPC (need bastion/VPN)
4. Incorrect credentials

**Solution**: 
- Verify security group rules
- Use RDS Proxy endpoint
- Set up bastion host or VPN
- Check Secrets Manager for correct credentials

### High costs

**Solution**:
- Check Aurora ACU usage (should scale down when idle)
- Verify NAT Gateway data transfer
- Review CloudWatch Logs retention
- Consider reducing backup retention

## Cost Estimation

### Development Environment
- Aurora Serverless v2: $30-50/month (low usage)
- RDS Proxy: $11/month
- NAT Gateway: $33/month + data transfer
- Secrets Manager: $0.40/month
- CloudWatch Logs: $5-10/month
- **Total**: ~$80-105/month

### Production Environment
- Aurora Serverless v2: $100-300/month (moderate usage)
- RDS Proxy: $11/month
- NAT Gateway: $33/month + data transfer
- Secrets Manager: $0.40/month
- CloudWatch Logs: $20-50/month
- **Total**: ~$165-395/month

## Security Checklist

- [ ] Database in private isolated subnets
- [ ] Encryption at rest enabled (KMS)
- [ ] Encryption in transit enabled (TLS)
- [ ] Secrets Manager for credentials
- [ ] Security groups with least privilege
- [ ] IAM roles with minimal permissions
- [ ] CloudWatch logging enabled
- [ ] Backup retention configured
- [ ] Deletion protection enabled (production)
- [ ] Multi-AZ enabled

## API Gateway Deployment

The CDK stack now includes API Gateway configuration with Lambda integrations. After deploying the stack, the API Gateway will be automatically configured with:

### API Gateway Features
- HTTP API (API Gateway v2) for lower latency and cost
- Lambda authorizer for IAM-based authentication
- CORS enabled for web UI access
- Throttling at 1000 req/sec
- CloudWatch logging for all requests
- All Lambda functions integrated with appropriate routes

### Get API Endpoint

After deployment, retrieve the API Gateway URL:

```bash
API_URL=$(aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text)

echo "API Gateway URL: $API_URL"
```

### Test API Endpoint

Test the API with an authenticated request:

```bash
# Test properties endpoint (requires IAM authentication)
curl -X GET "$API_URL/properties" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
```

### View API Gateway Logs

Monitor API Gateway requests:

```bash
# Tail API Gateway logs
aws logs tail /aws/apigateway/office-lease-api --follow

# Tail Lambda logs
aws logs tail /aws/lambda/office-lease-api --follow
```

### API Documentation

See `infrastructure/API-GATEWAY-CONFIG.md` for:
- Complete API route listing
- Authentication and authorization details
- CORS configuration
- Throttling settings
- Monitoring and troubleshooting

## Next Steps

1. ✅ Infrastructure deployed
2. ✅ API Gateway configured
3. ⏭️ Run database migrations (Task 1)
4. ⏭️ Test API endpoints
5. ⏭️ Load seed data (Task 19)
6. ⏭️ Set up monitoring (Task 20)

## Support

For issues or questions:
- Review CloudFormation events in AWS Console
- Check CloudWatch Logs for errors
- Review CDK documentation: https://docs.aws.amazon.com/cdk/
- Review Aurora documentation: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/
