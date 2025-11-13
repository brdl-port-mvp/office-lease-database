#!/bin/bash

# Office Lease Database - Seed Data Loading Script
# This script loads anonymized test data into the database

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
echo -e "${BLUE}Seed Data Loading${NC}"
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

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    exit 1
fi
print_success "Node.js found"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed"
    exit 1
fi

# Check AWS credentials
print_info "Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured"
    exit 1
fi
print_success "AWS credentials configured"
echo ""

# Get database connection details
print_info "Retrieving database connection details..."

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
    exit 1
fi

print_success "Database endpoint: $DB_PROXY_ENDPOINT"
echo ""

# Set environment variables for seed script
export DB_PROXY_ENDPOINT
export DB_SECRET_ARN
export DB_NAME
export AWS_REGION=$REGION

# Check if seed data already exists
print_info "Checking if seed data already exists..."
DB_CREDS=$(aws secretsmanager get-secret-value \
    --secret-id $DB_SECRET_ARN \
    --region $REGION \
    --query SecretString \
    --output text)

DB_USER=$(echo $DB_CREDS | jq -r .username)
DB_PASS=$(echo $DB_CREDS | jq -r .password)

# Count existing records
PROPERTY_COUNT=$(PGPASSWORD=$DB_PASS psql -h $DB_PROXY_ENDPOINT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM property;" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$PROPERTY_COUNT" -gt "0" ]; then
    print_warning "Database already contains $PROPERTY_COUNT properties"
    read -p "This will add more data. Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Seed data loading cancelled"
        exit 0
    fi
fi
echo ""

# Run seed data script
print_info "Loading seed data..."
print_info "This will create:"
print_info "  - 50 properties"
print_info "  - 150 suites"
print_info "  - 100 parties (tenants and landlords)"
print_info "  - 300 leases with versions"
print_info "  - Rent schedules, options, concessions, etc."
echo ""

if node seed-data.js; then
    print_success "Seed data loaded successfully!"
else
    print_error "Failed to load seed data"
    exit 1
fi

echo ""
print_success "Database is now populated with test data!"
