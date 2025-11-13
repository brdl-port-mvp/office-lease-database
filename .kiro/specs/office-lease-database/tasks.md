# Implementation Plan

- [x] 1. Set up database schema and migrations





  - Create Flyway migration structure in `/schema/migrations`
  - Write migration V001 for core tables (property, suite, party, lease)
  - Write migration V002 for lease detail tables (lease_version, rent_schedule, opex_pass_through)
  - Write migration V003 for option, concession, critical_date, doc_link tables
  - Write migration V004 for indexes (GIST on dateranges, B-tree on FKs, partial unique)
  - Write migration V005 for database views (all 9 reporting views)
  - Add constraint validation tests to ensure uniqueness and foreign key enforcement
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 19.1, 19.2, 19.3, 19.4, 19.5, 20.1, 20.2_

- [x] 2. Create AWS CDK infrastructure stack





  - Define VPC stack with private subnets and security groups
  - Define Aurora PostgreSQL Serverless v2 cluster with encryption
  - Define RDS Proxy for connection pooling
  - Define Secrets Manager secret for database credentials with rotation
  - Define IAM roles (lease_app_rw, analyst_ro, admin_dba) with policies
  - Configure CloudWatch log groups and metric filters
  - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

- [x] 3. Implement database connection layer





  - Create database connection utility using node-postgres with RDS Proxy support
  - Implement connection pooling configuration
  - Create query execution wrapper with error handling and logging
  - Add transaction management utilities (begin, commit, rollback)
  - Implement credential retrieval from Secrets Manager
  - _Requirements: 23.3_

- [x] 4. Implement property and suite API endpoints







- [x] 4.1 Create Lambda function for property CRUD operations


  - Implement POST /properties (create property with validation)
  - Implement GET /properties (list with filtering, sorting, pagination)
  - Implement GET /properties/{id} (retrieve single property)
  - Implement PUT /properties/{id} (update property)
  - Implement DELETE /properties/{id} (soft delete via active flag)
  - Add input validation for required fields and data types
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 4.2 Create Lambda function for suite CRUD operations


  - Implement POST /suites (create suite with property_id validation)
  - Implement GET /suites (list with filtering by property_id)
  - Implement GET /suites/{id} (retrieve single suite)
  - Implement PUT /suites/{id} (update suite)
  - Implement DELETE /suites/{id} (delete suite)
  - Enforce unique constraint on (property_id, suite_code)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 5. Implement party API endpoints





  - Create Lambda function for party CRUD operations
  - Implement POST /parties (create party with party_type validation)
  - Implement GET /parties (list with filtering by party_type)
  - Implement GET /parties/{id} (retrieve single party)
  - Implement PUT /parties/{id} (update party)
  - Implement DELETE /parties/{id} (soft delete via active flag)
  - Validate party_type enum values
  - _Requirements: 2.1, 2.2, 2.3, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 6. Implement lease and lease version API endpoints





- [x] 6.1 Create Lambda function for lease CRUD operations


  - Implement POST /leases (create lease with property, tenant, landlord validation)
  - Implement GET /leases (list with filtering by property, tenant, state)
  - Implement GET /leases/{id} (retrieve lease with current version details)
  - Implement PUT /leases/{id} (update lease master data)
  - Enforce unique constraint on (property_id, master_lease_num)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 6.2 Create endpoint for lease version management

  - Implement POST /leases/{id}/versions (create amendment)
  - Implement logic to set previous version is_current to FALSE
  - Implement logic to set new version is_current to TRUE
  - Validate effective_daterange does not overlap with existing versions
  - Validate escalation_method enum values
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 7. Implement rent schedule API endpoints





  - Create Lambda function for rent schedule CRUD operations
  - Implement POST /rent-schedules (create rent period with overlap validation)
  - Implement GET /rent-schedules (list by lease_version_id)
  - Implement PUT /rent-schedules/{id} (update rent period)
  - Implement DELETE /rent-schedules/{id} (delete rent period)
  - Validate basis enum values (MONTH, YEAR)
  - Enforce no overlapping period_daterange per lease_version
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 8. Implement OpEx pass-through API endpoints





  - Create Lambda function for OpEx CRUD operations
  - Implement POST /opex-pass-throughs (create OpEx config)
  - Implement GET /opex-pass-throughs (list by lease_version_id)
  - Implement PUT /opex-pass-throughs/{id} (update OpEx config)
  - Implement DELETE /opex-pass-throughs/{id} (delete OpEx config)
  - Validate method enum values (BASE_YEAR, EXPENSE_STOP, NNN, OTHER)
  - _Requirements: 6.1, 6.2, 6.3, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 9. Implement option API endpoints





  - Create Lambda function for option CRUD operations
  - Implement POST /options (create option with window_daterange)
  - Implement GET /options (list by lease_version_id with window status)
  - Implement PUT /options/{id} (update option)
  - Implement PUT /options/{id}/exercise (mark option as exercised)
  - Implement DELETE /options/{id} (delete option)
  - Validate option_type enum values
  - Calculate notice_window_open flag based on current date
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 10. Implement concession API endpoints





  - Create Lambda function for concession CRUD operations
  - Implement POST /concessions (create concession)
  - Implement GET /concessions (list by lease_version_id)
  - Implement PUT /concessions/{id} (update concession)
  - Implement DELETE /concessions/{id} (delete concession)
  - Validate kind enum values (TI_ALLOWANCE, FREE_RENT, OTHER)
  - Validate value_basis enum values (TOTAL, PER_SF)
  - Calculate months_remaining for FREE_RENT concessions
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 11. Implement critical date API endpoints





  - Create Lambda function for critical date CRUD operations
  - Implement POST /critical-dates (create critical date)
  - Implement GET /critical-dates (list by lease_id)
  - Implement PUT /critical-dates/{id} (update critical date)
  - Implement DELETE /critical-dates/{id} (delete critical date)
  - Validate kind enum values (COMMENCEMENT, RENT_START, EXPIRATION, NOTICE, OTHER)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 12. Implement document link API endpoints





  - Create Lambda function for document link CRUD operations
  - Implement POST /doc-links (create document link)
  - Implement GET /doc-links (list by lease_id)
  - Implement PUT /doc-links/{id} (update document link)
  - Implement DELETE /doc-links/{id} (delete document link)
  - Validate external_ref format (URL or ECM identifier)
  - _Requirements: 10.1, 10.2, 10.3, 21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 13. Implement reporting API endpoints




- [x] 13.1 Create expirations report endpoint


  - Implement GET /reports/expirations with query params (months, state, property_id)
  - Query vw_expirations view with filters
  - Calculate months_to_expiration dynamically
  - Support sorting by expiration_date or months_to_expiration
  - Return paginated results with total count
  - _Requirements: 11.1, 11.2, 11.3, 21.1, 21.3, 21.4, 21.5_


- [x] 13.2 Create rent roll report endpoint


  - Implement GET /reports/rent-roll with query params (date, property_id)
  - Query vw_rent_roll_current view with filters
  - Include monthly_equiv and annualized_equiv calculations
  - Support export format parameter (JSON, CSV)
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 21.1, 21.3, 21.4, 21.5_

- [x] 13.3 Create options status report endpoint



  - Implement GET /reports/options with query params (type, window_status)
  - Query vw_options_status view with filters
  - Calculate notice_window_open flag dynamically
  - Filter by option_type and exercised status
  - _Requirements: 13.1, 13.2, 13.3, 21.1, 21.3, 21.4, 21.5_

- [x] 13.4 Create free rent status report endpoint



  - Implement GET /reports/free-rent with query param (active_only)
  - Query vw_free_rent_status view
  - Calculate approx_months_remaining dynamically
  - Filter to only active free rent periods if requested
  - _Requirements: 14.1, 14.2, 14.3, 21.1, 21.3, 21.4, 21.5_

- [x] 13.5 Create TI allowance summary report endpoint



  - Implement GET /reports/ti-allowances with query param (lease_id)
  - Query vw_ti_allowance_summary view
  - Aggregate TI_ALLOWANCE concessions by lease
  - Support filtering by property or tenant
  - _Requirements: 15.1, 15.2, 15.3, 21.1, 21.3, 21.4, 21.5_

- [x] 13.6 Create critical dates report endpoint



  - Implement GET /reports/critical-dates with query param (days_ahead)
  - Query vw_critical_dates_upcoming view
  - Default to 180 days lookahead
  - Support filtering by critical date kind
  - Sort by date_value ascending
  - _Requirements: 16.1, 16.2, 16.3, 21.1, 21.3, 21.4, 21.5_

- [x] 13.7 Create amendment history report endpoint



  - Implement GET /reports/amendments with query param (lease_id)
  - Query vw_amendment_history view
  - Show all versions with effective date ranges
  - Highlight current version
  - _Requirements: 17.1, 17.2, 17.3, 21.1, 21.3, 21.4, 21.5_

- [x] 13.8 Create OpEx summary report endpoint



  - Implement GET /reports/opex-summary with query param (property_id)
  - Query vw_opex_summary view
  - Show current OpEx configurations only
  - Include method, stop_amount, and gross_up_pct
  - _Requirements: 18.1, 18.2, 21.1, 21.3, 21.4, 21.5_

- [x] 14. Implement batch operations API




- [x] 14.1 Create batch properties endpoint

  - Implement POST /batch/properties for bulk create/update
  - Accept array of up to 100 property records
  - Validate each record individually
  - Execute in single transaction with rollback on any error
  - Return success/error status for each record
  - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_


- [x] 14.2 Create batch parties endpoint


  - Implement POST /batch/parties for bulk create/update
  - Accept array of up to 100 party records
  - Validate party_type for each record
  - Execute in single transaction
  - Return detailed error information for failed records
  - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_




- [x] 14.3 Create batch leases endpoint

  - Implement POST /batch/leases for bulk create/update
  - Accept array of up to 100 lease records with initial versions
  - Validate all foreign key references
  - Create lease and initial lease_version in single transaction
  - Return created lease IDs and any validation errors
  - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_

- [x] 15. Implement natural language query processor





- [x] 15.1 Create query intent classifier

  - Implement Lambda function for natural language query processing
  - Integrate with AWS Bedrock for intent classification
  - Define intent categories (expiration, rent_roll, options, financial)
  - Extract query parameters (date ranges, property names, tenant names)
  - Return structured intent object with confidence score
  - _Requirements: 24.1, 24.2, 24.3_


- [x] 15.2 Create SQL generator for classified intents

  - Implement template-based SQL generation for each intent type
  - Use parameterized queries to prevent SQL injection
  - Map natural language entities to database columns
  - Whitelist allowed query patterns for security
  - Handle ambiguous queries with clarification prompts
  - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_


- [x] 15.3 Create natural language query endpoint










  - Implement POST /query/natural-language endpoint
  - Accept natural language query string in request body
  - Call intent classifier and SQL generator
  - Execute generated SQL against database
  - Format results in agent-friendly JSON structure
  - Include query metadata (intent, confidence, execution time)
  - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

- [x] 16. Implement authentication and authorization






- [x] 16.1 Create Lambda authorizer for API Gateway

  - Implement Lambda authorizer function to validate IAM signatures
  - Extract IAM principal and role from request context
  - Generate IAM policy document based on role
  - Cache authorization decisions for 5 minutes
  - Return 403 for unauthorized access attempts
  - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_



- [x] 16.2 Implement role-based access control in Lambda functions





  - Extract role from request context in each Lambda function
  - Implement permission checks for read-only vs read-write operations
  - Block POST/PUT/DELETE for analyst_ro role
  - Allow all operations for lease_app_rw and admin_dba roles
  - Log all authorization decisions with IAM principal
  - _Requirements: 22.2, 22.3, 22.4, 22.5_

- [x] 17. Configure API Gateway and integrate Lambda functions








  - Create HTTP API in API Gateway with custom domain
  - Configure Lambda integrations for all endpoints
  - Attach Lambda authorizer to API Gateway
  - Enable CORS for web UI access
  - Configure request/response transformations
  - Set up throttling limits (1000 req/sec)
  - Enable CloudWatch logging for all requests
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 22.1_


- [x] 18. Implement error handling and logging







- [x] 18.1 Create standardized error response formatter

  - Implement error response utility with consistent JSON structure
  - Map database errors to HTTP status codes
  - Include error code, message, details array, and request_id
  - Redact sensitive information from error messages

  - _Requirements: 21.5_


- [x] 18.2 Implement structured logging utility
  - Create logging utility with JSON structured logs
  - Include correlation IDs for request tracing
  - Log request/response payloads (excluding sensitive data)
  - Configure log levels (DEBUG, INFO, WARN, ERROR)
  - Send logs to CloudWatch with proper log groups
  - _Requirements: 22.5, 23.5_


- [x] 19. Create database seed data script

  - Write script to generate 300 anonymized lease records
  - Include mix of active and expired leases
  - Create 1-3 versions per lease with amendments
  - Generate rent schedules with 3-8 periods per lease
  - Add options, concessions, and critical dates
  - Ensure data satisfies all constraints (no overlaps, one current version)
  - _Requirements: 20.3, 20.4, 20.5_

- [x] 20. Implement monitoring and alerting






  - Create CloudWatch dashboard for API metrics (requests, latency, errors)
  - Create CloudWatch dashboard for database metrics (CPU, connections, IOPS)
  - Configure alarm for API error rate > 5% for 5 minutes
  - Configure alarm for database CPU > 80% for 10 minutes
  - Configure alarm for Lambda errors > 10 in 5 minutes
  - Configure alarm for database connections > 90% of max
  - Set up SNS topic for alarm notifications
  - _Requirements: 23.5_

- [x] 21. Create deployment scripts and documentation






  - Write CDK deployment script with environment-specific configurations
  - Create database migration execution script using Flyway
  - Write seed data loading script
  - Document API endpoints with request/response examples
  - Create deployment runbook with step-by-step instructions
  - Document rollback procedures for each deployment phase
  - _Requirements: 20.3, 20.4, 20.5_

- [x] 22. Write integration tests for API endpoints






  - Create test suite for property and suite endpoints
  - Create test suite for party endpoints
  - Create test suite for lease and lease version endpoints
  - Create test suite for rent schedule, OpEx, option, concession endpoints
  - Create test suite for critical date and doc link endpoints
  - Create test suite for all reporting endpoints
  - Create test suite for batch operations
  - Create test suite for natural language query endpoint
  - Test authentication and authorization with different IAM roles
  - Test error handling and validation
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 22.1, 22.2, 22.3, 22.4, 22.5_
