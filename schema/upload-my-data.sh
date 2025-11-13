#!/bin/bash

# Upload Your CSV Data to Aurora Database
# This script converts your CSV to SQL and loads it into the database

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}Upload Your Lease Data${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Check if CSV file provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide your CSV file${NC}"
    echo "Usage: ./schema/upload-my-data.sh <your-csv-file.csv>"
    echo ""
    echo "Example:"
    echo "  ./schema/upload-my-data.sh my-lease-data.csv"
    exit 1
fi

CSV_FILE="$1"

# Check if file exists
if [ ! -f "$CSV_FILE" ]; then
    echo -e "${RED}Error: File not found: $CSV_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found CSV file: $CSV_FILE"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

# Install csv-parse if needed
if ! node -e "require('csv-parse/sync')" 2>/dev/null; then
    echo -e "${YELLOW}Installing csv-parse...${NC}"
    npm install csv-parse
fi

# Get database connection details
echo -e "${BLUE}Getting database connection...${NC}"

STACK_NAME="OfficeLeaseDatabaseStack"
REGION="${AWS_REGION:-us-east-1}"

DB_ENDPOINT=$(aws cloudformation describe-stacks \
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

if [ -z "$DB_ENDPOINT" ]; then
    echo -e "${RED}Error: Could not find database. Is the stack deployed?${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Database endpoint: $DB_ENDPOINT"
echo ""

# Get database credentials
echo -e "${BLUE}Getting database credentials...${NC}"
DB_CREDS=$(aws secretsmanager get-secret-value \
    --secret-id $DB_SECRET_ARN \
    --region $REGION \
    --query SecretString \
    --output text)

DB_USER=$(echo $DB_CREDS | jq -r .username)
DB_PASS=$(echo $DB_CREDS | jq -r .password)

echo -e "${GREEN}✓${NC} Credentials retrieved"
echo ""

# Convert CSV to SQL
echo -e "${BLUE}Converting CSV to SQL...${NC}"
SQL_FILE="schema/import-data.sql"
node schema/import-csv-data.js "$CSV_FILE" > "$SQL_FILE"

if [ ! -s "$SQL_FILE" ]; then
    echo -e "${RED}Error: Failed to generate SQL${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} SQL generated: $SQL_FILE"
echo ""

# Show preview
echo -e "${BLUE}Preview of data to be imported:${NC}"
head -n 30 "$SQL_FILE"
echo "..."
echo ""

# Confirm
read -p "Ready to upload this data to the database? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Upload cancelled${NC}"
    exit 0
fi

# Load data
echo ""
echo -e "${BLUE}Uploading data to database...${NC}"

PGPASSWORD=$DB_PASS psql \
    -h $DB_ENDPOINT \
    -U $DB_USER \
    -d $DB_NAME \
    -f "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}✓ Data uploaded successfully!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    
    # Show summary
    echo -e "${BLUE}Verifying data...${NC}"
    PGPASSWORD=$DB_PASS psql \
        -h $DB_ENDPOINT \
        -U $DB_USER \
        -d $DB_NAME \
        -c "SELECT 'Properties' as table_name, COUNT(*) as count FROM property
            UNION ALL SELECT 'Parties', COUNT(*) FROM party
            UNION ALL SELECT 'Suites', COUNT(*) FROM suite
            UNION ALL SELECT 'Leases', COUNT(*) FROM lease
            UNION ALL SELECT 'Lease Versions', COUNT(*) FROM lease_version
            UNION ALL SELECT 'Rent Schedules', COUNT(*) FROM rent_schedule;"
    
    echo ""
    echo -e "${GREEN}Your data is now in the database!${NC}"
else
    echo ""
    echo -e "${RED}Error: Upload failed${NC}"
    exit 1
fi
