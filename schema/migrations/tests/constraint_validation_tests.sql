-- Constraint Validation Tests
-- These tests verify that all constraints are properly enforced

-- Test Setup: Create test data
BEGIN;

-- Insert test property
INSERT INTO property (name, address, state, postal_code, total_rsf) 
VALUES ('Test Building A', '123 Main St', 'CA', '90210', 50000);

-- Insert test parties
INSERT INTO party (legal_name, party_type) 
VALUES ('Test Tenant LLC', 'TENANT');

INSERT INTO party (legal_name, party_type) 
VALUES ('Test Landlord Inc', 'LANDLORD');

-- Insert test suite
INSERT INTO suite (property_id, suite_code, rsf) 
VALUES (1, 'Suite 100', 5000);

-- Insert test lease
INSERT INTO lease (property_id, landlord_id, tenant_id, master_lease_num, execution_date)
VALUES (1, 2, 1, 'LEASE-001', '2024-01-01');

-- Insert test lease version
INSERT INTO lease_version (lease_id, version_num, effective_daterange, suite_id, premises_rsf, term_months, is_current)
VALUES (1, 0, '[2024-01-01,2029-01-01)', 1, 5000, 60, TRUE);

ROLLBACK;

-- TEST 1: Unique constraint on (property_id, suite_code)
DO $$
BEGIN
    BEGIN
        INSERT INTO property (name) VALUES ('Test Property');
        INSERT INTO suite (property_id, suite_code, rsf) VALUES (currval('property_property_id_seq'), 'Suite 100', 1000);
        INSERT INTO suite (property_id, suite_code, rsf) VALUES (currval('property_property_id_seq'), 'Suite 100', 2000);
        RAISE EXCEPTION 'TEST FAILED: Duplicate suite_code should have been rejected';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'TEST PASSED: Unique constraint on (property_id, suite_code) enforced';
            ROLLBACK;
    END;
END $$;

-- TEST 2: Unique constraint on (property_id, master_lease_num)
DO $$
BEGIN
    BEGIN
        INSERT INTO property (name) VALUES ('Test Property 2');
        INSERT INTO party (legal_name, party_type) VALUES ('Tenant 1', 'TENANT');
        INSERT INTO party (legal_name, party_type) VALUES ('Landlord 1', 'LANDLORD');
        INSERT INTO lease (property_id, landlord_id, tenant_id, master_lease_num) 
        VALUES (currval('property_property_id_seq'), currval('party_party_id_seq')-1, currval('party_party_id_seq'), 'LEASE-001');
        INSERT INTO lease (property_id, landlord_id, tenant_id, master_lease_num) 
        VALUES (currval('property_property_id_seq'), currval('party_party_id_seq')-1, currval('party_party_id_seq'), 'LEASE-001');
        RAISE EXCEPTION 'TEST FAILED: Duplicate master_lease_num should have been rejected';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'TEST PASSED: Unique constraint on (property_id, master_lease_num) enforced';
            ROLLBACK;
    END;
END $$;

-- TEST 3: Partial unique index on (lease_id) WHERE is_current = TRUE
DO $$
BEGIN
    BEGIN
        INSERT INTO property (name) VALUES ('Test Property 3');
        INSERT INTO party (legal_name, party_type) VALUES ('Tenant 2', 'TENANT');
        INSERT INTO party (legal_name, party_type) VALUES ('Landlord 2', 'LANDLORD');
        INSERT INTO suite (property_id, suite_code) VALUES (currval('property_property_id_seq'), 'Suite 200');
        INSERT INTO lease (property_id, landlord_id, tenant_id, master_lease_num) 
        VALUES (currval('property_property_id_seq'), currval('party_party_id_seq')-1, currval('party_party_id_seq'), 'LEASE-002');
        INSERT INTO lease_version (lease_id, version_num, effective_daterange, suite_id, is_current)
        VALUES (currval('lease_lease_id_seq'), 0, '[2024-01-01,2029-01-01)', currval('suite_suite_id_seq'), TRUE);
        INSERT INTO lease_version (lease_id, version_num, effective_daterange, suite_id, is_current)
        VALUES (currval('lease_lease_id_seq'), 1, '[2024-06-01,2029-06-01)', currval('suite_suite_id_seq'), TRUE);
        RAISE EXCEPTION 'TEST FAILED: Multiple is_current=TRUE should have been rejected';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'TEST PASSED: Partial unique index on is_current enforced';
            ROLLBACK;
    END;
END $$;

-- TEST 4: Foreign key constraint on suite.property_id
DO $$
BEGIN
    BEGIN
        INSERT INTO suite (property_id, suite_code) VALUES (99999, 'Suite 999');
        RAISE EXCEPTION 'TEST FAILED: Invalid property_id should have been rejected';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'TEST PASSED: Foreign key constraint on suite.property_id enforced';
            ROLLBACK;
    END;
END $$;

-- TEST 5: Foreign key constraint on lease.tenant_id
DO $$
BEGIN
    BEGIN
        INSERT INTO property (name) VALUES ('Test Property 4');
        INSERT INTO party (legal_name, party_type) VALUES ('Landlord 3', 'LANDLORD');
        INSERT INTO lease (property_id, landlord_id, tenant_id, master_lease_num) 
        VALUES (currval('property_property_id_seq'), currval('party_party_id_seq'), 99999, 'LEASE-003');
        RAISE EXCEPTION 'TEST FAILED: Invalid tenant_id should have been rejected';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'TEST PASSED: Foreign key constraint on lease.tenant_id enforced';
            ROLLBACK;
    END;
END $$;

-- TEST 6: Check constraint on party_type
DO $$
BEGIN
    BEGIN
        INSERT INTO party (legal_name, party_type) VALUES ('Invalid Party', 'INVALID_TYPE');
        RAISE EXCEPTION 'TEST FAILED: Invalid party_type should have been rejected';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'TEST PASSED: Check constraint on party_type enforced';
            ROLLBACK;
    END;
END $$;

-- TEST 7: Check constraint on escalation_method
DO $$
BEGIN
    BEGIN
        INSERT INTO property (name) VALUES ('Test Property 5');
        INSERT INTO party (legal_name, party_type) VALUES ('Tenant 3', 'TENANT');
        INSERT INTO party (legal_name, party_type) VALUES ('Landlord 4', 'LANDLORD');
        INSERT INTO suite (property_id, suite_code) VALUES (currval('property_property_id_seq'), 'Suite 300');
        INSERT INTO lease (property_id, landlord_id, tenant_id, master_lease_num) 
        VALUES (currval('property_property_id_seq'), currval('party_party_id_seq')-1, currval('party_party_id_seq'), 'LEASE-004');
        INSERT INTO lease_version (lease_id, version_num, effective_daterange, suite_id, escalation_method, is_current)
        VALUES (currval('lease_lease_id_seq'), 0, '[2024-01-01,2029-01-01)', currval('suite_suite_id_seq'), 'INVALID_METHOD', TRUE);
        RAISE EXCEPTION 'TEST FAILED: Invalid escalation_method should have been rejected';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'TEST PASSED: Check constraint on escalation_method enforced';
            ROLLBACK;
    END;
END $$;

-- TEST 8: Exclusion constraint on rent_schedule overlapping periods
DO $$
BEGIN
    BEGIN
        INSERT INTO property (name) VALUES ('Test Property 6');
        INSERT INTO party (legal_name, party_type) VALUES ('Tenant 4', 'TENANT');
        INSERT INTO party (legal_name, party_type) VALUES ('Landlord 5', 'LANDLORD');
        INSERT INTO suite (property_id, suite_code) VALUES (currval('property_property_id_seq'), 'Suite 400');
        INSERT INTO lease (property_id, landlord_id, tenant_id, master_lease_num) 
        VALUES (currval('property_property_id_seq'), currval('party_party_id_seq')-1, currval('party_party_id_seq'), 'LEASE-005');
        INSERT INTO lease_version (lease_id, version_num, effective_daterange, suite_id, is_current)
        VALUES (currval('lease_lease_id_seq'), 0, '[2024-01-01,2029-01-01)', currval('suite_suite_id_seq'), TRUE);
        INSERT INTO rent_schedule (lease_version_id, period_daterange, amount, basis)
        VALUES (currval('lease_version_lease_version_id_seq'), '[2024-01-01,2024-12-31)', 5000, 'MONTH');
        INSERT INTO rent_schedule (lease_version_id, period_daterange, amount, basis)
        VALUES (currval('lease_version_lease_version_id_seq'), '[2024-06-01,2025-06-01)', 6000, 'MONTH');
        RAISE EXCEPTION 'TEST FAILED: Overlapping rent periods should have been rejected';
    EXCEPTION
        WHEN exclusion_violation THEN
            RAISE NOTICE 'TEST PASSED: Exclusion constraint on rent_schedule periods enforced';
            ROLLBACK;
    END;
END $$;

-- TEST 9: Check constraint on rent_schedule.basis
DO $$
BEGIN
    BEGIN
        INSERT INTO property (name) VALUES ('Test Property 7');
        INSERT INTO party (legal_name, party_type) VALUES ('Tenant 5', 'TENANT');
        INSERT INTO party (legal_name, party_type) VALUES ('Landlord 6', 'LANDLORD');
        INSERT INTO suite (property_id, suite_code) VALUES (currval('property_property_id_seq'), 'Suite 500');
        INSERT INTO lease (property_id, landlord_id, tenant_id, master_lease_num) 
        VALUES (currval('property_property_id_seq'), currval('party_party_id_seq')-1, currval('party_party_id_seq'), 'LEASE-006');
        INSERT INTO lease_version (lease_id, version_num, effective_daterange, suite_id, is_current)
        VALUES (currval('lease_lease_id_seq'), 0, '[2024-01-01,2029-01-01)', currval('suite_suite_id_seq'), TRUE);
        INSERT INTO rent_schedule (lease_version_id, period_daterange, amount, basis)
        VALUES (currval('lease_version_lease_version_id_seq'), '[2024-01-01,2024-12-31)', 5000, 'INVALID_BASIS');
        RAISE EXCEPTION 'TEST FAILED: Invalid basis should have been rejected';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'TEST PASSED: Check constraint on rent_schedule.basis enforced';
            ROLLBACK;
    END;
END $$;

-- TEST 10: Check constraint on option_type
DO $$
BEGIN
    BEGIN
        INSERT INTO property (name) VALUES ('Test Property 8');
        INSERT INTO party (legal_name, party_type) VALUES ('Tenant 6', 'TENANT');
        INSERT INTO party (legal_name, party_type) VALUES ('Landlord 7', 'LANDLORD');
        INSERT INTO suite (property_id, suite_code) VALUES (currval('property_property_id_seq'), 'Suite 600');
        INSERT INTO lease (property_id, landlord_id, tenant_id, master_lease_num) 
        VALUES (currval('property_property_id_seq'), currval('party_party_id_seq')-1, currval('party_party_id_seq'), 'LEASE-007');
        INSERT INTO lease_version (lease_id, version_num, effective_daterange, suite_id, is_current)
        VALUES (currval('lease_lease_id_seq'), 0, '[2024-01-01,2029-01-01)', currval('suite_suite_id_seq'), TRUE);
        INSERT INTO option (lease_version_id, option_type, window_daterange)
        VALUES (currval('lease_version_lease_version_id_seq'), 'INVALID_OPTION', '[2028-01-01,2028-06-01)');
        RAISE EXCEPTION 'TEST FAILED: Invalid option_type should have been rejected';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'TEST PASSED: Check constraint on option_type enforced';
            ROLLBACK;
    END;
END $$;

-- Summary
RAISE NOTICE '===========================================';
RAISE NOTICE 'All constraint validation tests completed';
RAISE NOTICE '===========================================';
