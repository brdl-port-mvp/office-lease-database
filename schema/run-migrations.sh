#!/bin/bash

# Office Lease Database - Flyway Migration Script
# This script executes database migrations using Flyway

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

STACK_NAME="OfficeLeaseDatabaseStack"
REGION="${AWS_REGION:-us-east-1}"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}Database Migration Execution${NC}"
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

# Check if Flyway is installed
print_info "Checking for Flyway..."
if ! command -v flyway &> /dev/null; then
    print_error "Flyway is not installed"
    print_info "Install Flyway:"
    print_info "  macOS: brew install flyway"
    print_info "  Linux: Download from https://flywaydb.org/download"
    print_info "  Windows: Download from https://flywaydb.org/download"
    exit 1
fi
FLYWAY_VERSION=$(flyway --version | head -n 1)
print_success "Flyway found: $FLYWAY_VERSION"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed"
    exit 1
fi

# Check AWS credentials
print_info "Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Run 'aws configure' first."
    exit 1
fi
print_success "AWS credentials configured"
echo ""

# Get database connection details from CloudFormation
print_info "Retrieving database connection details from CloudFormation..."

DB_PROXY_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseProxyEndpoint`].OutputValue' \
    --output text 2>/dev/null)

DB_SECRET_ARN=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
    --output text 2>/dev/null)

DB_NAME=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`DatabaseName`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$DB_PROXY_ENDPOINT" ] || [ -z "$DB_SECRET_ARN" ]; then
    print_error "Could not retrieve database connection details"
    print_error "Make sure the stack $STACK_NAME is deployed"
    exit 1
fi

print_success "Database endpoint: $DB_PROXY_ENDPOINT"
print_success "Database name: $DB_NAME"
echo ""

# Get database credentials from Secrets Manager
print_info "Retrieving database credentials from Secrets Manager..."
DB_CREDS=$(aws secretsmanager get-secret-value \
    --secret-id $DB_SECRET_ARN \
    --region $REGION \
    --query SecretString \
    --output text)

DB_USER=$(echo $DB_CREDS | jq -r .username)
DB_PASS=$(echo $DB_CREDS | jq -r .password)

if [ -z "$DB_USER" ] || [ -z "$DB_PASS" ]; then
    print_error "Could not retrieve database credentials"
    exit 1
fi

print_success "Database credentials retrieved"
echo ""

# Check network connectivity
print_warning "Note: Direct database connection requires network access to the VPC"
print_info "You may need:"
print_info "  - Bastion host in the VPC"
print_info "  - VPN connection to the VPC"
print_info "  - AWS Systems Manager Session Manager"
echo ""

# Construct JDBC URL
JDBC_URL="jdbc:postgresql://${DB_PROXY_ENDPOINT}:5432/${DB_NAME}"

print_info "JDBC URL: $JDBC_URL"
echo ""

# Test connection
print_info "Testing database connection..."
if psql -h $DB_PROXY_ENDPOINT -U $DB_USER -d $DB_NAME -c "SELECT 1;" &> /dev/null; then
    print_success "Database connection successful"
else
    print_error "Cannot connect to database"
    print_error "This script requires network access to the database"
    print_info "Alternative: Run migrations from a bastion host or Lambda function"
    exit 1
fi
echo ""

# Show current migration status
print_info "Checking current migration status..."
flyway \
    -url="$JDBC_URL" \
    -user="$DB_USER" \
    -password="$DB_PASS" \
    -locations="filesystem:./migrations" \
    info
echo ""

# Confirm migration
print_warning "This will execute pending migrations on the database"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Migration cancelled"
    exit 0
fi
echo ""

# Run migrations
print_info "Executing migrations..."
flyway \
    -url="$JDBC_URL" \
    -user="$DB_USER" \
    -password="$DB_PASS" \
    -locations="filesystem:./migrations" \
    migrate

print_success "Migrations completed successfully!"
echo ""

# Show final status
print_info "Final migration status:"
flyway \
    -url="$JDBC_URL" \
    -user="$DB_USER" \
    -password="$DB_PASS" \
    -locations="filesystem:./migrations" \
    info

echo ""
print_success "Database schema is up to date!"
