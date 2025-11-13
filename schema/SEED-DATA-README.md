# Seed Data Generator

This directory contains scripts to generate anonymized test data for the Office Lease Database.

## Overview

The seed data generator creates 300 realistic lease records with:
- 50 properties across 10 states
- 300+ suites
- 150 parties (20 landlords, 130 tenants/guarantors)
- 300 leases with 1-3 amendments each
- Rent schedules with 3-8 periods per lease
- OpEx pass-through configurations (70% of leases)
- Options (60% of current leases)
- Concessions (TI allowances and free rent)
- Critical dates (commencement, rent start, expiration, notices)
- Document links (1-4 per lease)

## Features

### Realistic Data
- Geographic distribution across major US cities
- Realistic RSF ranges (2,000-20,000 per suite)
- Market-rate rents ($25-$75 per RSF annually)
- Standard lease terms (3-10 years)
- Amendment history (0-3 amendments per lease)
- 3% annual rent escalations

### Edge Cases Covered
- Leases expiring soon (within 6-12 months)
- Active free rent periods
- Open notice windows for options
- Multiple versions per lease
- Various OpEx methods (BASE_YEAR, EXPENSE_STOP, NNN)
- Different option types (RENEWAL, TERMINATION, EXPANSION, ROFR)

### Data Integrity
- All foreign keys properly referenced
- Exactly one `is_current = true` per lease
- No overlapping rent periods
- Valid date ranges
- Positive amounts and RSF values

## Usage

### Generate SQL File

```bash
# Generate seed data SQL
node schema/seed-data.js > schema/seed-data.sql
```

### Load into Database

#### Local PostgreSQL (Docker)
```bash
# Start database
docker-compose up -d postgres

# Run migrations first
psql -h localhost -U postgres -d officeLeaseDB -f schema/migrations/V001__create_core_tables.sql
psql -h localhost -U postgres -d officeLeaseDB -f schema/migrations/V002__create_lease_detail_tables.sql
psql -h localhost -U postgres -d officeLeaseDB -f schema/migrations/V003__create_option_concession_date_doc_tables.sql
psql -h localhost -U postgres -d officeLeaseDB -f schema/migrations/V004__create_indexes.sql
psql -h localhost -U postgres -d officeLeaseDB -f schema/migrations/V005__create_views.sql

# Load seed data
psql -h localhost -U postgres -d officeLeaseDB -f schema/seed-data.sql
```

#### AWS RDS/Aurora
```bash
# Get database endpoint from CDK output
DB_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name LeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseProxyEndpoint`].OutputValue' \
  --output text)

# Get credentials from Secrets Manager
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name LeaseDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
  --output text)

DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query 'SecretString' \
  --output text | jq -r '.password')

# Load seed data
PGPASSWORD=$DB_PASSWORD psql \
  -h $DB_ENDPOINT \
  -U dbadmin \
  -d officeLeaseDB \
  -f schema/seed-data.sql
```

## Verification

After loading seed data, verify the data integrity:

```sql
-- Check record counts
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
UNION ALL
SELECT 'opex_pass_throughs', COUNT(*) FROM opex_pass_through
UNION ALL
SELECT 'options', COUNT(*) FROM option
UNION ALL
SELECT 'concessions', COUNT(*) FROM concession
UNION ALL
SELECT 'critical_dates', COUNT(*) FROM critical_date
UNION ALL
SELECT 'doc_links', COUNT(*) FROM doc_link;

-- Verify exactly one current version per lease
SELECT lease_id, COUNT(*) as current_versions
FROM lease_version
WHERE is_current = true
GROUP BY lease_id
HAVING COUNT(*) != 1;
-- Should return 0 rows

-- Verify no overlapping rent periods
SELECT lv.lease_id, lv.lease_version_id, COUNT(*) as overlaps
FROM lease_version lv
JOIN rent_schedule r1 ON r1.lease_version_id = lv.lease_version_id
JOIN rent_schedule r2 ON r2.lease_version_id = lv.lease_version_id
WHERE r1.rent_id < r2.rent_id
  AND r1.period_daterange && r2.period_daterange
GROUP BY lv.lease_id, lv.lease_version_id;
-- Should return 0 rows

-- Verify all foreign keys
SELECT 'suite -> property' as fk_check, COUNT(*) as orphans
FROM suite s
LEFT JOIN property p ON s.property_id = p.property_id
WHERE p.property_id IS NULL
UNION ALL
SELECT 'lease -> property', COUNT(*)
FROM lease l
LEFT JOIN property p ON l.property_id = p.property_id
WHERE p.property_id IS NULL
UNION ALL
SELECT 'lease -> landlord', COUNT(*)
FROM lease l
LEFT JOIN party p ON l.landlord_id = p.party_id
WHERE p.party_id IS NULL
UNION ALL
SELECT 'lease -> tenant', COUNT(*)
FROM lease l
LEFT JOIN party p ON l.tenant_id = p.party_id
WHERE p.party_id IS NULL;
-- All should return 0 orphans
```

## Sample Queries

### Leases Expiring Soon
```sql
SELECT * FROM vw_expirations
WHERE months_to_expiration <= 12
ORDER BY expiration_date
LIMIT 10;
```

### Current Rent Roll
```sql
SELECT * FROM vw_rent_roll_current
ORDER BY property_name, tenant_name
LIMIT 10;
```

### Options with Open Notice Windows
```sql
SELECT * FROM vw_options_status
WHERE notice_window_open = true
ORDER BY window_end
LIMIT 10;
```

### Active Free Rent
```sql
SELECT * FROM vw_free_rent_status
WHERE approx_months_remaining > 0
ORDER BY free_rent_end
LIMIT 10;
```

## Customization

To generate different data sets, modify the configuration at the top of `seed-data.js`:

```javascript
const NUM_PROPERTIES = 50;        // Number of properties
const NUM_SUITES_PER_PROPERTY = 6; // Average suites per property
const NUM_PARTIES = 150;          // Total parties (landlords + tenants)
const NUM_LEASES = 300;           // Number of leases
```

You can also modify:
- Geographic distribution (states, cities)
- Company name patterns
- Rent ranges
- Lease term lengths
- Amendment frequency
- Option/concession percentages

## CSV Export

To export seed data as CSV files for bulk import:

```bash
# Export each table
psql -h localhost -U postgres -d officeLeaseDB \
  -c "COPY property TO STDOUT WITH CSV HEADER" > property.csv

psql -h localhost -U postgres -d officeLeaseDB \
  -c "COPY suite TO STDOUT WITH CSV HEADER" > suite.csv

# ... repeat for other tables
```

## Cleanup

To remove all seed data and start fresh:

```sql
-- Delete in reverse order of dependencies
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

-- Reset sequences
SELECT setval('property_property_id_seq', 1, false);
SELECT setval('suite_suite_id_seq', 1, false);
SELECT setval('party_party_id_seq', 1, false);
SELECT setval('lease_lease_id_seq', 1, false);
SELECT setval('lease_version_lease_version_id_seq', 1, false);
SELECT setval('rent_schedule_rent_id_seq', 1, false);
SELECT setval('opex_pass_through_opex_id_seq', 1, false);
SELECT setval('option_option_id_seq', 1, false);
SELECT setval('concession_concession_id_seq', 1, false);
SELECT setval('critical_date_crit_id_seq', 1, false);
SELECT setval('doc_link_doc_id_seq', 1, false);
```

## Troubleshooting

### Error: relation does not exist
Make sure you've run all migrations before loading seed data.

### Error: duplicate key value violates unique constraint
The database already contains data. Either clean up existing data or modify the seed script to use different IDs.

### Error: foreign key constraint violation
Ensure the seed data script is run in a single transaction (it uses BEGIN/COMMIT).

### Performance Issues
For large data sets (>1000 leases), consider:
- Using COPY instead of INSERT
- Disabling indexes temporarily
- Increasing work_mem
- Running in batches

## Next Steps

After loading seed data:
1. Verify data integrity (see Verification section)
2. Test API endpoints with real data
3. Generate reports to validate views
4. Test natural language queries
5. Load test with concurrent requests
