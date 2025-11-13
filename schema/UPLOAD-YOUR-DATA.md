# Upload Your CSV Data

Quick guide to upload your actual lease data from a CSV file into the Aurora database.

## Prerequisites

1. **CSV file** with your lease data
2. **Node.js** installed
3. **AWS CLI** configured with credentials
4. **PostgreSQL client** (psql) installed
5. **Database deployed** (run `./infrastructure/deploy.sh` first)

## Step 1: Prepare Your CSV

Your CSV should have columns like:
- `property_name` or `property` or `building`
- `address`, `city`, `state`, `postal_code`
- `landlord` or `landlord_name`
- `tenant` or `tenant_name`
- `suite` or `suite_number` or `unit`
- `rsf` or `square_feet` or `size`
- `start_date` or `commencement_date`
- `end_date` or `expiration_date`
- `monthly_rent` or `rent` or `base_rent`
- `lease_number` or `lease_id`

**The script is flexible** - it will try to match common column names automatically.

### Example CSV:
```csv
property_name,address,city,state,tenant,suite,rsf,start_date,end_date,monthly_rent
Downtown Tower,123 Main St,New York,NY,Acme Corp,1001,5000,2023-01-01,2028-01-01,25000
Midtown Plaza,456 Park Ave,New York,NY,Tech Inc,2050,8000,2022-06-01,2027-06-01,40000
```

## Step 2: Upload Your Data

### On Windows (PowerShell):
```powershell
.\schema\upload-my-data.ps1 your-lease-data.csv
```

### On Mac/Linux (Bash):
```bash
chmod +x schema/upload-my-data.sh
./schema/upload-my-data.sh your-lease-data.csv
```

### Manual Process:
```bash
# 1. Install dependencies
npm install csv-parse

# 2. Convert CSV to SQL
node schema/import-csv-data.js your-lease-data.csv > schema/import-data.sql

# 3. Get database connection
DB_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseProxyEndpoint`].OutputValue' \
  --output text)

DB_SECRET=$(aws cloudformation describe-stacks \
  --stack-name OfficeLeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
  --output text)

DB_PASS=$(aws secretsmanager get-secret-value \
  --secret-id $DB_SECRET \
  --query 'SecretString' \
  --output text | jq -r '.password')

# 4. Load data
PGPASSWORD=$DB_PASS psql \
  -h $DB_ENDPOINT \
  -U postgres \
  -d lease_db \
  -f schema/import-data.sql
```

## Step 3: Verify Your Data

After upload, check your data:

```sql
-- Count records
SELECT 'Properties' as table_name, COUNT(*) FROM property
UNION ALL SELECT 'Leases', COUNT(*) FROM lease
UNION ALL SELECT 'Rent Schedules', COUNT(*) FROM rent_schedule;

-- View your leases
SELECT 
  p.name as property,
  pt.legal_name as tenant,
  lv.premises_rsf,
  lv.effective_daterange
FROM lease l
JOIN property p ON l.property_id = p.property_id
JOIN party pt ON l.tenant_id = pt.party_id
JOIN lease_version lv ON l.lease_id = lv.lease_id
WHERE lv.is_current = true
LIMIT 10;
```

## Customizing the Import

If your CSV has different column names, edit `schema/import-csv-data.js`:

```javascript
// Find these lines and update with your column names:
const propertyName = record.property_name || record.YOUR_COLUMN_NAME;
const tenantName = record.tenant || record.YOUR_TENANT_COLUMN;
const monthlyRent = record.monthly_rent || record.YOUR_RENT_COLUMN;
```

## Troubleshooting

### "File not found"
Make sure you're running the command from the project root directory.

### "Database not found"
Deploy the infrastructure first:
```bash
cd infrastructure
./deploy.sh
```

### "Connection timeout"
Your database might be in a private subnet. From AWS CloudShell:
```bash
# Get security group
SG_ID=$(aws rds describe-db-clusters \
  --query 'DBClusters[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)

# Allow CloudShell access
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5432 \
  --cidr 0.0.0.0/0
```

### "csv-parse not found"
Install it:
```bash
npm install csv-parse
```

### "psql command not found"
Install PostgreSQL client:
- **Windows**: Download from https://www.postgresql.org/download/windows/
- **Mac**: `brew install postgresql`
- **Linux**: `sudo apt-get install postgresql-client`

## What Gets Created

The import script automatically creates:
1. **Properties** - Unique buildings from your CSV
2. **Parties** - Landlords and tenants
3. **Suites** - Individual units
4. **Leases** - Lease records linking everything together
5. **Lease Versions** - Current lease terms
6. **Rent Schedules** - Rent amounts and periods

## Next Steps

After uploading your data:
1. Test the API endpoints
2. Run queries to verify accuracy
3. Set up monitoring and alerts
4. Create reports and dashboards

## Need Help?

If your CSV format is very different, share a sample row and I can customize the import script for you!
