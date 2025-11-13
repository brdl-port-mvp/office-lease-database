# Database Migrations

This directory contains Flyway-compatible database migration scripts for the Office Lease Data Platform.

## Migration Files

Migrations are executed in version order:

0. **V000__enable_extensions.sql** - Enable required PostgreSQL extensions (btree_gist)
1. **V001__create_core_tables.sql** - Core tables (property, suite, party, lease)
2. **V002__create_lease_detail_tables.sql** - Lease detail tables (lease_version, rent_schedule, opex_pass_through)
3. **V003__create_option_concession_date_doc_tables.sql** - Option, concession, critical_date, doc_link tables
4. **V004__create_indexes.sql** - Performance indexes (GIST on dateranges, B-tree on FKs, partial unique)
5. **V005__create_views.sql** - Reporting views (9 views for expirations, rent roll, options, etc.)

## Running Migrations

### Using Flyway CLI

```bash
# Install Flyway (if not already installed)
# Download from https://flywaydb.org/download/

# Configure Flyway connection
export FLYWAY_URL="jdbc:postgresql://localhost:5432/lease_db"
export FLYWAY_USER="your_username"
export FLYWAY_PASSWORD="your_password"

# Run migrations
flyway -locations=filesystem:./schema/migrations migrate

# Check migration status
flyway -locations=filesystem:./schema/migrations info
```

### Using psql

```bash
# Run migrations manually in order
psql -h localhost -U your_username -d lease_db -f schema/migrations/V000__enable_extensions.sql
psql -h localhost -U your_username -d lease_db -f schema/migrations/V001__create_core_tables.sql
psql -h localhost -U your_username -d lease_db -f schema/migrations/V002__create_lease_detail_tables.sql
psql -h localhost -U your_username -d lease_db -f schema/migrations/V003__create_option_concession_date_doc_tables.sql
psql -h localhost -U your_username -d lease_db -f schema/migrations/V004__create_indexes.sql
psql -h localhost -U your_username -d lease_db -f schema/migrations/V005__create_views.sql
```

### Using AWS RDS/Aurora

```bash
# Connect to RDS instance
psql -h your-rds-endpoint.region.rds.amazonaws.com -U admin -d lease_db

# Run migrations from local files
\i schema/migrations/V000__enable_extensions.sql
\i schema/migrations/V001__create_core_tables.sql
\i schema/migrations/V002__create_lease_detail_tables.sql
\i schema/migrations/V003__create_option_concession_date_doc_tables.sql
\i schema/migrations/V004__create_indexes.sql
\i schema/migrations/V005__create_views.sql
```

## Constraint Validation Tests

The `tests/constraint_validation_tests.sql` file contains automated tests to verify:

- Unique constraints (suite_code, master_lease_num)
- Foreign key constraints (all relationships)
- Check constraints (enum values)
- Exclusion constraints (no overlapping rent periods)
- Partial unique index (one current version per lease)

### Running Tests

```bash
psql -h localhost -U your_username -d lease_db -f schema/migrations/tests/constraint_validation_tests.sql
```

Expected output: All tests should pass with "TEST PASSED" messages.

## Schema Overview

### Core Tables
- **property**: Buildings/sites with address and total RSF
- **suite**: Subdivided rentable spaces within properties
- **party**: Tenants, landlords, guarantors
- **lease**: Contract shell linking tenant, landlord, and property

### Lease Detail Tables
- **lease_version**: Original lease and amendments with effective date ranges
- **rent_schedule**: Base rent periods with amounts and billing basis
- **opex_pass_through**: Operating expense recovery configuration

### Supporting Tables
- **option**: Renewal, termination, expansion, ROFR options
- **concession**: TI allowances and free rent periods
- **critical_date**: Key milestone dates (commencement, expiration, etc.)
- **doc_link**: References to external document management systems

### Reporting Views
- **vw_expirations**: Leases expiring in the future with months to expiration
- **vw_rent_roll_current**: Current month rent with monthly/annual equivalents
- **vw_options_status**: Options with notice window status
- **vw_free_rent_status**: Active free rent periods with months remaining
- **vw_ti_allowance_summary**: Total TI allowances by lease
- **vw_critical_dates_upcoming**: Critical dates in next 180 days
- **vw_amendment_history**: All lease versions with effective periods
- **vw_opex_summary**: Current OpEx configurations

## Key Constraints

1. **Unique Constraints**
   - `(property_id, suite_code)` - Suite codes unique within property
   - `(property_id, master_lease_num)` - Lease numbers unique within property
   - `(lease_id) WHERE is_current = TRUE` - Exactly one current version per lease

2. **Foreign Keys**
   - All relationships enforced with ON DELETE RESTRICT
   - Prevents orphaned records

3. **Exclusion Constraints**
   - Rent schedule periods cannot overlap within a lease version

4. **Check Constraints**
   - Enum values validated (party_type, escalation_method, basis, option_type, etc.)
   - Currency code restricted to 'USD' in Phase 1

## Rollback

To rollback migrations, drop objects in reverse order:

```sql
-- Drop views
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

-- Drop indexes (will be dropped with tables)

-- Drop tables in reverse dependency order
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

## Notes

- All migrations are idempotent where possible
- Timestamps (created_at, updated_at) are automatically set
- PostgreSQL 12+ required for GIST indexes on daterange
- Extension `btree_gist` is automatically enabled by V000 migration (required for exclusion constraints)
- V000 migration must run first to enable required extensions
