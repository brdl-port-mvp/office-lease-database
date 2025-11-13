#!/bin/bash

# Office Lease Database - CDK Deployment Script
# This script handles the complete deployment of the infrastructure stack

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="OfficeLeaseDatabaseStack"
REGION="${AWS_REGION:-us-east-1}"
ALARM_EMAIL="${ALARM_EMAIL:-}"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}Office Lease Database - CDK Deployment${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
print_info "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi
NODE_VERSION=$(node --version)
print_success "Node.js $NODE_VERSION found"

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi
NPM_VERSION=$(npm --version)
print_success "npm $NPM_VERSION found"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install AWS CLI first."
    exit 1
fi
AWS_VERSION=$(aws --version)
print_success "AWS CLI found: $AWS_VERSION"

# Check AWS credentials
print_info "Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Run 'aws configure' first."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CALLER_ARN=$(aws sts get-caller-identity --query Arn --output text)
print_success "AWS credentials configured"
print_info "Account ID: $ACCOUNT_ID"
print_info "Caller: $CALLER_ARN"
print_info "Region: $REGION"
echo ""

# Check CDK CLI
print_info "Checking AWS CDK CLI..."
if ! command -v cdk &> /dev/null; then
    print_warning "AWS CDK CLI not found. Installing globally..."
    npm install -g aws-cdk
fi
CDK_VERSION=$(cdk --version)
print_success "AWS CDK CLI found: $CDK_VERSION"
echo ""

# Install dependencies
print_info "Installing project dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
    print_success "Dependencies installed"
else
    print_info "Dependencies already installed (run 'npm install' to update)"
fi
echo ""

# Check if CDK is bootstrapped
print_info "Checking CDK bootstrap status..."
BOOTSTRAP_STACK="CDKToolkit"
if aws cloudformation describe-stacks --stack-name $BOOTSTRAP_STACK --region $REGION &> /dev/null; then
    print_success "CDK is already bootstrapped in $REGION"
else
    print_warning "CDK is not bootstrapped in $REGION"
    read -p "Would you like to bootstrap CDK now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Bootstrapping CDK..."
        cdk bootstrap aws://$ACCOUNT_ID/$REGION
        print_success "CDK bootstrapped successfully"
    else
        print_error "CDK bootstrap is required. Exiting."
        exit 1
    fi
fi
echo ""

# Check for alarm email
if [ -z "$ALARM_EMAIL" ]; then
    print_warning "ALARM_EMAIL environment variable not set"
    print_info "Alarms will be created without email notifications"
    print_info "You can add email subscriptions later via AWS Console or CLI"
    read -p "Continue without email notifications? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Set ALARM_EMAIL and run again:"
        print_info "  export ALARM_EMAIL=your-email@example.com"
        print_info "  ./deploy.sh"
        exit 0
    fi
else
    print_success "Alarm notifications will be sent to: $ALARM_EMAIL"
fi
echo ""

# Synthesize CloudFormation template
print_info "Synthesizing CloudFormation template..."
if cdk synth > /dev/null; then
    print_success "Template synthesized successfully"
else
    print_error "Failed to synthesize template"
    exit 1
fi
echo ""

# Show diff if stack exists
print_info "Checking for existing stack..."
if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION &> /dev/null; then
    print_warning "Stack $STACK_NAME already exists"
    print_info "Showing changes that will be made..."
    echo ""
    cdk diff
    echo ""
    read -p "Continue with deployment? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Deployment cancelled"
        exit 0
    fi
else
    print_info "This is a new deployment"
    print_info "The following resources will be created:"
    print_info "  - VPC with public, private, and database subnets"
    print_info "  - Aurora PostgreSQL Serverless v2 cluster"
    print_info "  - RDS Proxy for connection pooling"
    print_info "  - 13 Lambda functions for API endpoints"
    print_info "  - API Gateway HTTP API"
    print_info "  - IAM roles and policies"
    print_info "  - CloudWatch dashboards and alarms"
    print_info "  - SNS topic for notifications"
    print_info "  - Secrets Manager secret for database credentials"
    print_info "  - KMS encryption keys"
    echo ""
    print_warning "Estimated deployment time: 15-25 minutes"
    print_warning "Estimated monthly cost: \$80-300 (depending on usage)"
    echo ""
    read -p "Continue with deployment? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Deployment cancelled"
        exit 0
    fi
fi
echo ""

# Deploy the stack
print_info "Deploying stack $STACK_NAME..."
print_info "This will take 15-25 minutes (Aurora cluster creation is slow)..."
echo ""

if cdk deploy --require-approval never; then
    print_success "Stack deployed successfully!"
else
    print_error "Deployment failed"
    print_info "Check CloudFormation console for details:"
    print_info "  https://console.aws.amazon.com/cloudformation/home?region=$REGION"
    exit 1
fi
echo ""

# Get stack outputs
print_info "Retrieving stack outputs..."
echo ""

API_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text 2>/dev/null || echo "")

DB_PROXY_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseProxyEndpoint`].OutputValue' \
    --output text 2>/dev/null || echo "")

DB_SECRET_ARN=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
    --output text 2>/dev/null || echo "")

ALARM_TOPIC_ARN=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`AlarmTopicArn`].OutputValue' \
    --output text 2>/dev/null || echo "")

DASHBOARD_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
    --output text 2>/dev/null || echo "")

# Display summary
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "${BLUE}Stack Outputs:${NC}"
echo ""
if [ -n "$API_URL" ]; then
    echo -e "${GREEN}API Gateway URL:${NC}"
    echo "  $API_URL"
    echo ""
fi
if [ -n "$DB_PROXY_ENDPOINT" ]; then
    echo -e "${GREEN}Database Proxy Endpoint:${NC}"
    echo "  $DB_PROXY_ENDPOINT"
    echo ""
fi
if [ -n "$DB_SECRET_ARN" ]; then
    echo -e "${GREEN}Database Secret ARN:${NC}"
    echo "  $DB_SECRET_ARN"
    echo ""
fi
if [ -n "$ALARM_TOPIC_ARN" ]; then
    echo -e "${GREEN}Alarm Topic ARN:${NC}"
    echo "  $ALARM_TOPIC_ARN"
    echo ""
fi
if [ -n "$DASHBOARD_URL" ]; then
    echo -e "${GREEN}CloudWatch Dashboard:${NC}"
    echo "  $DASHBOARD_URL"
    echo ""
fi

# Next steps
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo "1. Run database migrations:"
echo "   cd schema/migrations"
echo "   # Follow instructions in schema/migrations/README.md"
echo ""
echo "2. Load seed data (optional):"
echo "   node schema/seed-data.js"
echo ""
echo "3. Test API endpoint:"
echo "   curl -X GET \"$API_URL/properties\""
echo ""
echo "4. View monitoring dashboard:"
echo "   Open: $DASHBOARD_URL"
echo ""

if [ -n "$ALARM_EMAIL" ]; then
    echo "5. Confirm email subscription:"
    echo "   Check your email ($ALARM_EMAIL) for SNS confirmation"
    echo ""
fi

echo -e "${GREEN}Deployment successful!${NC}"
