# Office Lease Database Infrastructure

This directory contains the AWS CDK infrastructure code for the Office Lease Database system.

## Architecture Overview

The infrastructure stack includes:

1. **VPC with Private Subnets**: Multi-AZ VPC with public, private, and isolated database subnets
2. **Aurora PostgreSQL Serverless v2**: Auto-scaling database cluster (0.5-4 ACUs)
3. **RDS Proxy**: Connection pooling for Lambda functions
4. **Secrets Manager**: Encrypted database credentials with rotation support
5. **IAM Roles**: Three roles with different access levels
6. **CloudWatch**: Log groups and metric filters for monitoring
7. **KMS**: Encryption key for data at rest

## Prerequisites

- Node.js 18+ and npm
- AWS CDK CLI: `npm install -g aws-cdk`
- AWS CLI configured with appropriate credentials
- AWS account with permissions to create VPC, RDS, IAM resources

## Installation

```bash
# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap

# Synthesize CloudFormation template
npm run synth

# Deploy the stack
npm run deploy
```

## IAM Roles

### lease_app_rw
- **Purpose**: Service role for application Lambda functions
- **Access**: Full CRUD operations on database
- **Assumed by**: Lambda service principal

### analyst_ro
- **Purpose**: Read-only access for analysts and BI tools
- **Access**: Read-only queries via RDS Proxy
- **Assumed by**: Lambda service principal and IAM users

### admin_dba
- **Purpose**: Database administration and schema migrations
- **Access**: Full RDS and database access
- **Assumed by**: Lambda service principal and IAM users

## Security Features

- **Encryption at Rest**: KMS encryption for Aurora cluster and Secrets Manager
- **Encryption in Transit**: TLS required for RDS Proxy connections
- **Network Isolation**: Database in isolated subnets with no internet access
- **Security Groups**: Least-privilege network access rules
- **Key Rotation**: Automatic KMS key rotation enabled

## Monitoring

### CloudWatch Log Groups

- `/aws/apigateway/office-lease-api`: API Gateway access logs
- `/aws/lambda/office-lease-api`: Lambda function logs
- Aurora PostgreSQL logs: Exported to CloudWatch

### Metric Filters

- **ClientErrors**: Count of 4xx API responses
- **ServerErrors**: Count of 5xx API responses
- **LambdaErrors**: Count of ERROR level log entries
- **ConnectionErrors**: Database connection failures

## Database Configuration

- **Engine**: Aurora PostgreSQL 15.4
- **Capacity**: 0.5 - 4 ACUs (auto-scaling)
- **Storage**: Auto-scaling, encrypted with KMS
- **Backups**: Daily snapshots, 7-day retention
- **Multi-AZ**: Enabled with reader instance
- **Maintenance Window**: Sunday 04:00-05:00 UTC

## RDS Proxy Configuration

- **Max Connections**: 100% of database max
- **Idle Connections**: 50% of max
- **Connection Timeout**: 30 seconds
- **TLS**: Required
- **Subnets**: Private subnets with NAT gateway

## Outputs

After deployment, the stack exports the following values:

- `OfficeLease-VpcId`: VPC identifier
- `OfficeLease-DbClusterEndpoint`: Aurora writer endpoint
- `OfficeLease-DbClusterReadEndpoint`: Aurora reader endpoint
- `OfficeLease-DbProxyEndpoint`: RDS Proxy endpoint (use this for Lambda)
- `OfficeLease-DbSecretArn`: Secrets Manager ARN for credentials
- `OfficeLease-DbName`: Database name (officeLeaseDB)
- `OfficeLease-LeaseAppRwRoleArn`: Application role ARN
- `OfficeLease-AnalystRoRoleArn`: Analyst role ARN
- `OfficeLease-AdminDbaRoleArn`: Admin role ARN
- `OfficeLease-LambdaSecurityGroupId`: Security group for Lambda functions
- `OfficeLease-KmsKeyId`: KMS key for encryption

## Cost Considerations

- **Aurora Serverless v2**: Pay per ACU-hour (scales 0.5-4 ACUs)
- **RDS Proxy**: ~$0.015/hour per proxy
- **NAT Gateway**: ~$0.045/hour + data transfer
- **Secrets Manager**: $0.40/secret/month + API calls
- **CloudWatch Logs**: $0.50/GB ingested

Estimated monthly cost (low usage): $50-100
Estimated monthly cost (moderate usage): $150-300

## Production Recommendations

Before deploying to production, update the following:

1. Set `deletionProtection: true` on Aurora cluster
2. Change `removalPolicy` to `SNAPSHOT` for Aurora
3. Change `removalPolicy` to `RETAIN` for KMS key
4. Increase backup retention to 30+ days
5. Enable Performance Insights on Aurora
6. Configure SNS topics for CloudWatch alarms
7. Set up AWS Backup for additional protection
8. Review and adjust ACU limits based on load testing

## Troubleshooting

### CDK Deployment Fails

- Ensure AWS credentials are configured: `aws sts get-caller-identity`
- Check CDK is bootstrapped: `cdk bootstrap`
- Review CloudFormation events in AWS Console

### Database Connection Issues

- Verify Lambda is in correct VPC and subnets
- Check security group rules allow traffic
- Confirm RDS Proxy endpoint is used (not direct cluster endpoint)
- Verify IAM role has `rds-db:connect` permission

### High Costs

- Check Aurora ACU usage in CloudWatch metrics
- Review RDS Proxy connection count
- Optimize Lambda cold starts to reduce connection churn
- Consider reducing backup retention period

## Next Steps

After infrastructure deployment:

1. Run Flyway migrations to create schema (see `/schema/migrations`)
2. Deploy Lambda functions for API layer (Task 3)
3. Configure API Gateway (Task 17)
4. Load seed data (Task 19)
5. Set up monitoring dashboards and alarms (Task 20)
