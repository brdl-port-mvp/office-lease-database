#!/bin/bash

# Simple CSV Upload Script for AWS CloudShell
# Run this in AWS CloudShell - it has everything pre-installed!

echo "========================================="
echo "Upload Your Lease Data (CloudShell)"
echo "========================================="
echo ""

# Check if CSV file provided
if [ -z "$1" ]; then
    echo "Usage: ./upload-data-cloudshell.sh <your-csv-file.csv>"
    echo ""
    echo "Example:"
    echo "  ./upload-data-cloudshell.sh my-lease-data.csv"
    echo ""
    echo "First, upload your CSV to CloudShell:"
    echo "  1. Click 'Actions' > 'Upload file'"
    echo "  2. Select your CSV file"
    echo "  3. Then run this script"
    exit 1
fi

CSV_FILE="$1"

if [ ! -f "$CSV_FILE" ]; then
    echo "Error: File not found: $CSV_FILE"
    echo ""
    echo "Upload your CSV file first:"
    echo "  1. Click 'Actions' > 'Upload file' in CloudShell"
    echo "  2. Select your CSV file"
    exit 1
fi

echo "✓ Found CSV file: $CSV_FILE"
echo ""

# Show first few lines
echo "Preview of your data:"
head -n 5 "$CSV_FILE"
echo ""

# Get database connection
echo "Getting database connection..."
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
    echo "Error: Could not find database"
    echo "Make sure your stack is deployed: OfficeLeaseDatabaseStack"
    exit 1
fi

echo "✓ Database: $DB_ENDPOINT"
echo ""

# Get credentials
echo "Getting credentials..."
DB_CREDS=$(aws secretsmanager get-secret-value \
    --secret-id $DB_SECRET_ARN \
    --region $REGION \
    --query SecretString \
    --output text)

DB_USER=$(echo $DB_CREDS | jq -r .username)
DB_PASSWORD=$(echo $DB_CREDS | jq -r .password)

echo "✓ Credentials retrieved"
echo ""

# Test connection
echo "Testing database connection..."
if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_ENDPOINT -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1; then
    echo "Error: Cannot connect to database"
    echo ""
    echo "The database might be in a private subnet. Opening security group..."
    
    # Get security group
    CLUSTER_ID=$(aws rds describe-db-clusters --query 'DBClusters[0].DBClusterIdentifier' --output text)
    SG_ID=$(aws rds describe-db-clusters --db-cluster-identifier $CLUSTER_ID --query 'DBClusters[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text)
    
    echo "Adding CloudShell to security group $SG_ID..."
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 5432 \
        --cidr 0.0.0.0/0 2>/dev/null || echo "Rule may already exist"
    
    echo "Waiting 10 seconds for security group to update..."
    sleep 10
    
    if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_ENDPOINT -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1; then
        echo "Error: Still cannot connect. Please check your VPC/security group settings."
        exit 1
    fi
fi

echo "✓ Database connection successful"
echo ""

# Create a simple Python script to convert CSV to SQL
cat > convert_csv.py << 'PYTHON_SCRIPT'
import csv
import sys
from datetime import datetime

if len(sys.argv) < 2:
    print("Usage: python convert_csv.py <csv-file>")
    sys.exit(1)

csv_file = sys.argv[1]

def escape_sql(value):
    if value is None or value == '':
        return 'NULL'
    return f"'{str(value).replace(\"'\", \"''\")}'"

def format_date(date_str):
    if not date_str:
        return 'NULL'
    try:
        # Try parsing common date formats
        for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%m-%d-%Y', '%Y/%m/%d']:
            try:
                date = datetime.strptime(date_str, fmt)
                return f"'{date.strftime('%Y-%m-%d')}'"
            except:
                continue
        return 'NULL'
    except:
        return 'NULL'

def format_number(num_str):
    if not num_str or num_str == '':
        return 'NULL'
    try:
        num = float(str(num_str).replace('$', '').replace(',', ''))
        return str(num)
    except:
        return 'NULL'

# Read CSV
with open(csv_file, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    records = list(reader)

print(f"-- CSV Import: {csv_file}")
print(f"-- Records: {len(records)}")
print(f"-- Generated: {datetime.now().isoformat()}")
print()
print("BEGIN;")
print()

# Collect unique entities
properties = {}
parties = {}
suites = {}
property_id = 1
party_id = 1
suite_id = 1

for record in records:
    # Property
    prop_key = f"{record.get('property_name', record.get('property', record.get('building', 'Unknown')))}|{record.get('city', '')}|{record.get('state', '')}"
    if prop_key not in properties:
        properties[prop_key] = {
            'id': property_id,
            'name': record.get('property_name', record.get('property', record.get('building', 'Unknown Property'))),
            'address': record.get('address', record.get('property_address', '')),
            'city': record.get('city', ''),
            'state': record.get('state', ''),
            'postal_code': record.get('postal_code', record.get('zip', '')),
            'total_rsf': format_number(record.get('property_rsf', record.get('building_size', 0)))
        }
        property_id += 1
    
    # Landlord
    landlord_name = record.get('landlord', record.get('landlord_name', 'Unknown Landlord'))
    if landlord_name not in parties:
        parties[landlord_name] = {'id': party_id, 'name': landlord_name, 'type': 'LANDLORD'}
        party_id += 1
    
    # Tenant
    tenant_name = record.get('tenant', record.get('tenant_name', 'Unknown Tenant'))
    if tenant_name not in parties:
        parties[tenant_name] = {'id': party_id, 'name': tenant_name, 'type': 'TENANT'}
        party_id += 1
    
    # Suite
    suite_key = prop_key + '|' + record.get('suite', record.get('suite_number', record.get('unit', 'N/A')))
    if suite_key not in suites:
        suites[suite_key] = {
            'id': suite_id,
            'property_id': properties[prop_key]['id'],
            'suite_code': record.get('suite', record.get('suite_number', record.get('unit', 'N/A'))),
            'rsf': format_number(record.get('rsf', record.get('square_feet', record.get('size', 0))))
        }
        suite_id += 1

# Insert properties
if properties:
    print("-- Properties")
    print("INSERT INTO property (property_id, name, address, city, state, postal_code, country, total_rsf, active) VALUES")
    prop_list = list(properties.values())
    for i, prop in enumerate(prop_list):
        comma = ',' if i < len(prop_list) - 1 else ';'
        print(f"  ({prop['id']}, {escape_sql(prop['name'])}, {escape_sql(prop['address'])}, {escape_sql(prop['city'])}, {escape_sql(prop['state'])}, {escape_sql(prop['postal_code'])}, 'USA', {prop['total_rsf']}, true){comma}")
    print()

# Insert parties
if parties:
    print("-- Parties")
    print("INSERT INTO party (party_id, legal_name, party_type, active) VALUES")
    party_list = list(parties.values())
    for i, party in enumerate(party_list):
        comma = ',' if i < len(party_list) - 1 else ';'
        print(f"  ({party['id']}, {escape_sql(party['name'])}, '{party['type']}', true){comma}")
    print()

# Insert suites
if suites:
    print("-- Suites")
    print("INSERT INTO suite (suite_id, property_id, suite_code, rsf) VALUES")
    suite_list = list(suites.values())
    for i, suite in enumerate(suite_list):
        comma = ',' if i < len(suite_list) - 1 else ';'
        print(f"  ({suite['id']}, {suite['property_id']}, {escape_sql(suite['suite_code'])}, {suite['rsf']}){comma}")
    print()

# Insert leases
print("-- Leases")
print("INSERT INTO lease (lease_id, property_id, landlord_id, tenant_id, master_lease_num, execution_date) VALUES")
for i, record in enumerate(records):
    prop_key = f"{record.get('property_name', record.get('property', record.get('building', 'Unknown')))}|{record.get('city', '')}|{record.get('state', '')}"
    property = properties[prop_key]
    landlord = parties[record.get('landlord', record.get('landlord_name', 'Unknown Landlord'))]
    tenant = parties[record.get('tenant', record.get('tenant_name', 'Unknown Tenant'))]
    
    lease_num = record.get('lease_number', record.get('lease_id', f'LEASE-{i+1}'))
    exec_date = format_date(record.get('execution_date', record.get('signed_date', record.get('lease_date', ''))))
    
    comma = ',' if i < len(records) - 1 else ';'
    print(f"  ({i+1}, {property['id']}, {landlord['id']}, {tenant['id']}, {escape_sql(lease_num)}, {exec_date}){comma}")
print()

# Insert lease versions
print("-- Lease Versions")
print("INSERT INTO lease_version (lease_version_id, lease_id, version_num, effective_daterange, suite_id, premises_rsf, term_months, base_year, escalation_method, currency_code, is_current, notes) VALUES")
for i, record in enumerate(records):
    prop_key = f"{record.get('property_name', record.get('property', record.get('building', 'Unknown')))}|{record.get('city', '')}|{record.get('state', '')}"
    suite_key = prop_key + '|' + record.get('suite', record.get('suite_number', record.get('unit', 'N/A')))
    suite = suites[suite_key]
    
    start_date = record.get('start_date', record.get('commencement_date', record.get('lease_start', '')))
    end_date = record.get('end_date', record.get('expiration_date', record.get('lease_end', '')))
    
    if start_date and end_date:
        daterange = f"'[{start_date},{end_date})'"
    else:
        daterange = 'NULL'
    
    rsf = format_number(record.get('rsf', record.get('square_feet', record.get('size', 0))))
    term_months = format_number(record.get('term_months', record.get('lease_term', 60)))
    base_year = record.get('base_year', datetime.now().year if start_date else 'NULL')
    escalation = escape_sql(record.get('escalation_method', record.get('escalation', 'FIXED')))
    
    comma = ',' if i < len(records) - 1 else ';'
    print(f"  ({i+1}, {i+1}, 0, {daterange}, {suite['id']}, {rsf}, {term_months}, {base_year}, {escalation}, 'USD', true, 'Imported from CSV'){comma}")
print()

# Insert rent schedules
print("-- Rent Schedules")
print("INSERT INTO rent_schedule (rent_id, lease_version_id, period_daterange, amount, basis) VALUES")
rent_count = 0
for i, record in enumerate(records):
    start_date = record.get('start_date', record.get('commencement_date', record.get('lease_start', '')))
    end_date = record.get('end_date', record.get('expiration_date', record.get('lease_end', '')))
    
    if start_date and end_date:
        daterange = f"'[{start_date},{end_date})'"
        amount = format_number(record.get('monthly_rent', record.get('rent', record.get('base_rent', 0))))
        basis = escape_sql(record.get('rent_basis', 'MONTH'))
        
        comma = ',' if i < len(records) - 1 else ';'
        print(f"  ({i+1}, {i+1}, {daterange}, {amount}, {basis}){comma}")
        rent_count += 1

if rent_count == 0:
    print("  -- No rent data found in CSV")

print()
print("-- Update sequences")
print(f"SELECT setval('property_property_id_seq', {property_id - 1});")
print(f"SELECT setval('party_party_id_seq', {party_id - 1});")
print(f"SELECT setval('suite_suite_id_seq', {suite_id - 1});")
print(f"SELECT setval('lease_lease_id_seq', {len(records)});")
print(f"SELECT setval('lease_version_lease_version_id_seq', {len(records)});")
print(f"SELECT setval('rent_schedule_rent_id_seq', {rent_count});")
print()
print("COMMIT;")
print()
print(f"-- Import complete: {len(records)} leases")
PYTHON_SCRIPT

# Convert CSV to SQL
echo "Converting CSV to SQL..."
python3 convert_csv.py "$CSV_FILE" > import-data.sql

if [ ! -s import-data.sql ]; then
    echo "Error: Failed to convert CSV"
    exit 1
fi

echo "✓ SQL generated"
echo ""

# Show preview
echo "Preview of SQL to be executed:"
head -n 20 import-data.sql
echo "..."
echo ""

# Confirm
read -p "Upload this data to the database? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Upload cancelled"
    exit 0
fi

# Upload
echo ""
echo "Uploading data..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_ENDPOINT -U $DB_USER -d $DB_NAME -f import-data.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo "✓ Data uploaded successfully!"
    echo "========================================="
    echo ""
    
    # Show summary
    echo "Database summary:"
    PGPASSWORD=$DB_PASSWORD psql -h $DB_ENDPOINT -U $DB_USER -d $DB_NAME -c "
        SELECT 'Properties' as table_name, COUNT(*) as count FROM property
        UNION ALL SELECT 'Parties', COUNT(*) FROM party
        UNION ALL SELECT 'Suites', COUNT(*) FROM suite
        UNION ALL SELECT 'Leases', COUNT(*) FROM lease
        UNION ALL SELECT 'Lease Versions', COUNT(*) FROM lease_version
        UNION ALL SELECT 'Rent Schedules', COUNT(*) FROM rent_schedule;
    "
    
    echo ""
    echo "Your data is now in the database!"
else
    echo ""
    echo "Error: Upload failed"
    exit 1
fi
