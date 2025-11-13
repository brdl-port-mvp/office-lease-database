# Requirements Document

## Introduction

The Office Lease Data Platform is a centralized database system designed to manage structured lease data for commercial real estate operations. The system will power expirations tracking, rent roll reporting, options management, and amendment history tracking. Phase 1 focuses on data-only storage (no document files) with anonymized demo data, providing a foundation for real estate operations, legal, finance, and analytics teams.

## Glossary

- **System**: The Office Lease Data Platform database and associated views
- **Property**: A building or site that contains rentable space
- **Suite**: A subdivided rentable space within a Property
- **Party**: A company or person involved in lease agreements (tenant, landlord, guarantor, etc.)
- **Lease**: A contract shell that ties together a tenant, landlord, and property
- **Lease Version**: A specific state of a Lease after amendments (version 0 is the original)
- **Rent Schedule**: Base rent periods with amounts and billing basis (monthly or annual)
- **OpEx Pass-Through**: Operating expense recovery method (base year, expense stop, NNN)
- **Option**: Contractual rights for renewal, termination, expansion, or right of first refusal
- **Concession**: Tenant improvements allowances or free rent periods
- **Critical Date**: Key milestone dates (commencement, rent start, expiration, notice deadlines)
- **Current Version**: The active Lease Version for a given Lease (exactly one per lease)
- **Rent Roll**: A report showing current rent amounts across the portfolio
- **Expirations Pipeline**: A report showing leases expiring within a specified timeframe

## Requirements

### Requirement 1

**User Story:** As a real estate operations manager, I want to store property and suite information, so that I can track all rentable spaces in my portfolio

#### Acceptance Criteria

1. THE System SHALL store Property records with name, address, state, postal code, country, total RSF, and active status
2. THE System SHALL store Suite records with property association, suite code, and RSF
3. THE System SHALL enforce that each Suite code is unique within its Property
4. THE System SHALL allow Properties to contain zero or more Suites

### Requirement 2

**User Story:** As a legal team member, I want to track parties involved in leases, so that I can identify tenants, landlords, and guarantors

#### Acceptance Criteria

1. THE System SHALL store Party records with legal name, party type, and active status
2. THE System SHALL support party types of TENANT, LANDLORD, SUBLANDLORD, and GUARANTOR
3. THE System SHALL allow a Party to participate in multiple Leases

### Requirement 3

**User Story:** As a lease administrator, I want to create lease records linking tenants, landlords, and properties, so that I can establish the basic contract structure

#### Acceptance Criteria

1. THE System SHALL store Lease records with property reference, landlord reference, tenant reference, master lease number, and execution date
2. THE System SHALL enforce that each Lease references exactly one Property
3. THE System SHALL enforce that each Lease references exactly one landlord Party
4. THE System SHALL enforce that each Lease references exactly one tenant Party
5. THE System SHALL enforce that master lease numbers are unique within each Property

### Requirement 4

**User Story:** As a lease administrator, I want to track lease versions for original leases and amendments, so that I can maintain a complete history of lease changes

#### Acceptance Criteria

1. THE System SHALL store Lease Version records with lease reference, version number, effective date range, suite reference, premises RSF, term months, base year, escalation method, currency code, current status flag, and notes
2. THE System SHALL enforce that version number 0 represents the original lease
3. THE System SHALL enforce that exactly one Lease Version per Lease has is_current set to TRUE
4. THE System SHALL support escalation methods of CPI, FIXED, BASE_YEAR, NNN, and OTHER
5. THE System SHALL default currency code to USD

### Requirement 5

**User Story:** As a finance analyst, I want to define rent schedules with amounts and billing periods, so that I can calculate monthly and annual rent obligations

#### Acceptance Criteria

1. THE System SHALL store Rent Schedule records with lease version reference, period date range, amount, and basis
2. THE System SHALL support basis values of MONTH and YEAR
3. THE System SHALL enforce that period date ranges do not overlap within a single Lease Version
4. WHEN basis is YEAR, THE System SHALL calculate monthly equivalent as amount divided by 12
5. WHEN basis is MONTH, THE System SHALL calculate annual equivalent as amount multiplied by 12

### Requirement 6

**User Story:** As a finance analyst, I want to track operating expense pass-through configurations, so that I can calculate tenant OpEx obligations

#### Acceptance Criteria

1. THE System SHALL store OpEx Pass-Through records with lease version reference, method, stop amount, gross-up percentage, and notes
2. THE System SHALL support methods of BASE_YEAR, EXPENSE_STOP, NNN, and OTHER
3. THE System SHALL allow stop amount and gross-up percentage to be optional

### Requirement 7

**User Story:** As a real estate operations manager, I want to track lease options with notice windows, so that I can identify when tenants can exercise renewal, termination, or expansion rights

#### Acceptance Criteria

1. THE System SHALL store Option records with lease version reference, option type, notice window date range, terms, exercised flag, and exercised date
2. THE System SHALL support option types of RENEWAL, TERMINATION, EXPANSION, ROFR, and OTHER
3. WHEN current date falls within the notice window date range, THE System SHALL indicate that the notice window is open
4. THE System SHALL default exercised flag to FALSE

### Requirement 8

**User Story:** As a finance analyst, I want to track concessions like TI allowances and free rent, so that I can account for tenant incentives

#### Acceptance Criteria

1. THE System SHALL store Concession records with lease version reference, kind, value amount, value basis, applicable date range, and notes
2. THE System SHALL support concession kinds of TI_ALLOWANCE, FREE_RENT, and OTHER
3. THE System SHALL support value basis of TOTAL and PER_SF
4. WHEN concession kind is FREE_RENT and the applicable date range extends beyond current date, THE System SHALL calculate approximate months remaining

### Requirement 9

**User Story:** As a lease administrator, I want to record critical dates for each lease, so that I can track commencement, rent start, expiration, and notice deadlines

#### Acceptance Criteria

1. THE System SHALL store Critical Date records with lease reference, kind, date value, and notes
2. THE System SHALL support critical date kinds of COMMENCEMENT, RENT_START, EXPIRATION, NOTICE, and OTHER
3. WHEN a Critical Date with kind EXPIRATION exists for a Lease, THE System SHALL use that date as the expiration date
4. WHEN no Critical Date with kind EXPIRATION exists for a Lease, THE System SHALL calculate expiration date as the upper bound of the current Lease Version effective date range minus one day

### Requirement 10

**User Story:** As a legal team member, I want to store references to external lease documents, so that I can link to document management systems without storing files in the database

#### Acceptance Criteria

1. THE System SHALL store Document Link records with lease reference, label, and external reference
2. THE System SHALL allow multiple Document Links per Lease
3. THE System SHALL store external references as URLs or document management system identifiers

### Requirement 11

**User Story:** As a real estate operations manager, I want to view an expirations pipeline report, so that I can identify leases expiring in the next 6 or 12 months

#### Acceptance Criteria

1. THE System SHALL provide a view showing lease ID, master lease number, tenant name, property name, state, expiration date, and months to expiration
2. THE System SHALL calculate months to expiration as the number of 30-day periods between current date and expiration date
3. THE System SHALL include only current Lease Versions in the expirations view

### Requirement 12

**User Story:** As a finance analyst, I want to generate a current-month rent roll, so that I can report monthly and annualized rent for all active leases

#### Acceptance Criteria

1. THE System SHALL provide a view showing lease ID, master lease number, tenant name, property name, period start, period end, basis, amount, monthly equivalent, and annualized equivalent
2. WHEN current date falls within a Rent Schedule period date range, THE System SHALL include that rent period in the current-month rent roll
3. THE System SHALL include only current Lease Versions in the rent roll view
4. THE System SHALL display one row per current Lease in the rent roll view

### Requirement 13

**User Story:** As a real estate operations manager, I want to view options inventory with status, so that I can track which notice windows are currently open

#### Acceptance Criteria

1. THE System SHALL provide a view showing lease ID, master lease number, tenant name, property name, option type, window start, window end, notice window open flag, terms, exercised flag, and exercised date
2. THE System SHALL set notice window open flag to TRUE when current date falls within the option window date range
3. THE System SHALL include only Options from current Lease Versions

### Requirement 14

**User Story:** As a finance analyst, I want to view free rent status, so that I can identify active free rent periods and remaining months

#### Acceptance Criteria

1. THE System SHALL provide a view showing lease ID, master lease number, tenant name, property name, free rent start, free rent end, value amount, value basis, and approximate months remaining
2. WHEN a Concession of kind FREE_RENT has an applicable date range extending beyond current date, THE System SHALL include it in the free rent status view
3. THE System SHALL calculate approximate months remaining as 30-day periods between current date and free rent end date

### Requirement 15

**User Story:** As a finance analyst, I want to view TI allowance summary, so that I can report total tenant improvement commitments per lease

#### Acceptance Criteria

1. THE System SHALL provide a view showing lease ID, master lease number, tenant name, property name, and total TI amount
2. THE System SHALL sum all Concessions of kind TI_ALLOWANCE for each current Lease Version
3. THE System SHALL group TI allowances by Lease

### Requirement 16

**User Story:** As a lease administrator, I want to view upcoming critical dates, so that I can prepare for important deadlines within the next 90 or 180 days

#### Acceptance Criteria

1. THE System SHALL provide a view showing lease ID, master lease number, tenant name, property name, critical date kind, and date value
2. THE System SHALL include Critical Dates with date values between current date and 180 days in the future
3. THE System SHALL order upcoming critical dates by date value

### Requirement 17

**User Story:** As a legal team member, I want to view amendment history, so that I can see all versions of a lease and their effective periods

#### Acceptance Criteria

1. THE System SHALL provide a view showing lease ID, master lease number, lease version ID, version number, effective start date, effective end date, and current status flag
2. THE System SHALL include all Lease Versions for all Leases
3. THE System SHALL order amendment history by lease ID and version number

### Requirement 18

**User Story:** As a finance analyst, I want to view OpEx summary, so that I can understand operating expense recovery methods for current leases

#### Acceptance Criteria

1. THE System SHALL provide a view showing lease ID, master lease number, property name, OpEx method, stop amount, and gross-up percentage
2. THE System SHALL include only OpEx Pass-Through records from current Lease Versions

### Requirement 19

**User Story:** As a database administrator, I want the system to enforce data integrity constraints, so that the database maintains consistent and valid data

#### Acceptance Criteria

1. THE System SHALL enforce foreign key relationships between all related entities
2. THE System SHALL enforce that Suite codes are unique within each Property using a composite constraint
3. THE System SHALL enforce that master lease numbers are unique within each Property using a composite constraint
4. THE System SHALL enforce that exactly one Lease Version per Lease has is_current TRUE using a partial unique index
5. THE System SHALL prevent deletion of referenced records through foreign key constraints

### Requirement 20

**User Story:** As a system administrator, I want the system to support efficient querying of date ranges, so that reports execute within performance SLOs

#### Acceptance Criteria

1. THE System SHALL create GIST indexes on all daterange columns
2. THE System SHALL create B-tree indexes on all foreign key columns
3. WHEN searching for records with date range conditions, THE System SHALL return results in less than 1 second at the 50th percentile
4. WHEN retrieving lease detail views, THE System SHALL return results in less than 2 seconds
5. WHEN exporting up to 50,000 rows, THE System SHALL complete in less than 30 seconds

### Requirement 21

**User Story:** As an AWS developer, I want to access the lease database through a REST API, so that I can integrate lease data with AWS agents and services

#### Acceptance Criteria

1. THE System SHALL provide a REST API that exposes all database views as queryable endpoints
2. THE System SHALL provide API endpoints for creating, reading, updating, and deleting lease entities
3. THE System SHALL support query parameters for filtering, sorting, and pagination on all list endpoints
4. THE System SHALL return responses in JSON format
5. THE System SHALL implement proper HTTP status codes for success and error conditions

### Requirement 22

**User Story:** As an AWS developer, I want the API to support authentication and authorization, so that only authorized agents can access lease data

#### Acceptance Criteria

1. THE System SHALL authenticate API requests using AWS IAM or API keys
2. THE System SHALL authorize requests based on role-based access control
3. THE System SHALL support read-only access for analyst roles
4. THE System SHALL support read-write access for application service roles
5. THE System SHALL log all API access attempts with user identity and timestamp

### Requirement 23

**User Story:** As an AWS developer, I want the database to be deployed on AWS infrastructure, so that it integrates seamlessly with other AWS services

#### Acceptance Criteria

1. THE System SHALL deploy the PostgreSQL database on AWS RDS or Aurora PostgreSQL
2. THE System SHALL deploy the REST API on AWS Lambda or ECS
3. THE System SHALL use AWS Secrets Manager to store database credentials
4. THE System SHALL enable VPC security groups to control network access to the database
5. THE System SHALL support AWS CloudWatch for monitoring and logging

### Requirement 24

**User Story:** As an AWS agent developer, I want the API to provide natural language query capabilities, so that agents can retrieve lease information using conversational queries

#### Acceptance Criteria

1. THE System SHALL provide an API endpoint that accepts natural language queries about lease data
2. WHEN an agent requests lease expirations in natural language, THE System SHALL translate the query to SQL and return matching results
3. WHEN an agent requests rent roll information in natural language, THE System SHALL translate the query to SQL and return matching results
4. THE System SHALL return query results in a structured JSON format suitable for agent consumption
5. THE System SHALL handle ambiguous queries by returning clarification prompts or best-match results

### Requirement 25

**User Story:** As an AWS developer, I want the API to support batch operations, so that agents can efficiently process multiple lease records

#### Acceptance Criteria

1. THE System SHALL provide API endpoints for batch creation of lease entities
2. THE System SHALL provide API endpoints for batch updates of lease entities
3. WHEN a batch operation contains validation errors, THE System SHALL return detailed error information for each failed record
4. THE System SHALL process batch operations transactionally to ensure data consistency
5. THE System SHALL support batch sizes up to 100 records per request
