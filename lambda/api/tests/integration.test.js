/**
 * Integration Tests for Office Lease Database API
 * Tests all API endpoints with real database interactions
 */

const db = require('../db');

// Import all Lambda handlers
const propertiesHandler = require('../properties').handler;
const suitesHandler = require('../suites').handler;
const partiesHandler = require('../parties').handler;
const leasesHandler = require('../leases').handler;
const rentSchedulesHandler = require('../rent-schedules').handler;
const opexHandler = require('../opex-pass-throughs').handler;
const optionsHandler = require('../options').handler;
const concessionsHandler = require('../concessions').handler;
const criticalDatesHandler = require('../critical-dates').handler;
const docLinksHandler = require('../doc-links').handler;
const reportsHandler = require('../reports').handler;
const batchHandler = require('../batch').handler;
const nlqHandler = require('../nlq').handler;

// Test data storage
let testPropertyId;
let testSuiteId;
let testTenantId;
let testLandlordId;
let testLeaseId;
let testLeaseVersionId;

// Mock environment variables
process.env.DB_SECRET_ARN = 'test-secret-arn';
process.env.DB_NAME = 'lease_db_test';
process.env.AWS_REGION = 'us-east-1';

/**
 * Helper function to create test event
 */
function createEvent(httpMethod, path, body = null, queryParams = null, pathParams = null, role = 'lease_app_rw') {
  return {
    httpMethod,
    path,
    body: body ? JSON.stringify(body) : null,
    queryStringParameters: queryParams,
    pathParameters: pathParams,
    requestContext: {
      authorizer: {
        role: role,
        principalId: 'test-user'
      }
    },
    headers: {
      'Content-Type': 'application/json'
    }
  };
}

/**
 * Helper function to parse response
 */
function parseResponse(response) {
  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.body)
  };
}

describe('Office Lease Database API Integration Tests', () => {
  
  // Setup and teardown
  beforeAll(async () => {
    // Ensure database connection is established
    await db.getPool();
  });

  afterAll(async () => {
    // Clean up test data and close connections
    if (testLeaseId) {
      await db.query('DELETE FROM lease WHERE lease_id = $1', [testLeaseId]);
    }
    if (testSuiteId) {
      await db.query('DELETE FROM suite WHERE suite_id = $1', [testSuiteId]);
    }
    if (testPropertyId) {
      await db.query('DELETE FROM property WHERE property_id = $1', [testPropertyId]);
    }
    if (testTenantId) {
      await db.query('DELETE FROM party WHERE party_id = $1', [testTenantId]);
    }
    if (testLandlordId) {
      await db.query('DELETE FROM party WHERE party_id = $1', [testLandlordId]);
    }
    
    await db.closePool();
  });

  // Property API Tests
  describe('Property API', () => {
    
    test('POST /properties - Create property', async () => {
      const event = createEvent('POST', '/properties', {
        name: 'Test Building A',
        address: '123 Test St',
        state: 'CA',
        postal_code: '90210',
        country: 'USA',
        total_rsf: 50000
      });

      const response = await propertiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.property_id).toBeDefined();
      expect(parsed.body.name).toBe('Test Building A');
      
      testPropertyId = parsed.body.property_id;
    });

    test('GET /properties/{id} - Get property by ID', async () => {
      const event = createEvent('GET', `/properties/${testPropertyId}`, null, null, { id: testPropertyId });

      const response = await propertiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.property_id).toBe(testPropertyId);
      expect(parsed.body.name).toBe('Test Building A');
    });

    test('GET /properties - List properties with filters', async () => {
      const event = createEvent('GET', '/properties', null, { state: 'CA', limit: '10' });

      const response = await propertiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.data).toBeDefined();
      expect(Array.isArray(parsed.body.data)).toBe(true);
      expect(parsed.body.pagination).toBeDefined();
    });

    test('PUT /properties/{id} - Update property', async () => {
      const event = createEvent('PUT', `/properties/${testPropertyId}`, {
        total_rsf: 55000
      }, null, { id: testPropertyId });

      const response = await propertiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.total_rsf).toBe(55000);
    });
  });

  // Suite API Tests
  describe('Suite API', () => {
    
    test('POST /suites - Create suite', async () => {
      const event = createEvent('POST', '/suites', {
        property_id: testPropertyId,
        suite_code: 'SUITE-101',
        rsf: 2500
      });

      const response = await suitesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.suite_id).toBeDefined();
      expect(parsed.body.suite_code).toBe('SUITE-101');
      
      testSuiteId = parsed.body.suite_id;
    });

    test('GET /suites - List suites by property', async () => {
      const event = createEvent('GET', '/suites', null, { property_id: testPropertyId });

      const response = await suitesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.data).toBeDefined();
      expect(parsed.body.data.length).toBeGreaterThan(0);
    });
  });

  // Party API Tests
  describe('Party API', () => {
    
    test('POST /parties - Create tenant', async () => {
      const event = createEvent('POST', '/parties', {
        legal_name: 'Test Tenant Corp',
        party_type: 'TENANT'
      });

      const response = await partiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.party_id).toBeDefined();
      expect(parsed.body.party_type).toBe('TENANT');
      
      testTenantId = parsed.body.party_id;
    });

    test('POST /parties - Create landlord', async () => {
      const event = createEvent('POST', '/parties', {
        legal_name: 'Test Landlord LLC',
        party_type: 'LANDLORD'
      });

      const response = await partiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.party_type).toBe('LANDLORD');
      
      testLandlordId = parsed.body.party_id;
    });

    test('GET /parties - List parties by type', async () => {
      const event = createEvent('GET', '/parties', null, { party_type: 'TENANT' });

      const response = await partiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.data).toBeDefined();
    });
  });

  // Lease API Tests
  describe('Lease API', () => {
    
    test('POST /leases - Create lease with initial version', async () => {
      const event = createEvent('POST', '/leases', {
        property_id: testPropertyId,
        landlord_id: testLandlordId,
        tenant_id: testTenantId,
        master_lease_num: 'TEST-LEASE-001',
        execution_date: '2024-01-01',
        lease_version: {
          suite_id: testSuiteId,
          premises_rsf: 2500,
          term_months: 60,
          effective_daterange: '[2024-02-01,2029-01-31]',
          escalation_method: 'FIXED',
          base_year: 2024
        }
      });

      const response = await leasesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.lease_id).toBeDefined();
      expect(parsed.body.master_lease_num).toBe('TEST-LEASE-001');
      
      testLeaseId = parsed.body.lease_id;
      testLeaseVersionId = parsed.body.current_version.lease_version_id;
    });

    test('GET /leases/{id} - Get lease with current version', async () => {
      const event = createEvent('GET', `/leases/${testLeaseId}`, null, null, { id: testLeaseId });

      const response = await leasesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.lease_id).toBe(testLeaseId);
      expect(parsed.body.current_version).toBeDefined();
    });

    test('POST /leases/{id}/versions - Create amendment', async () => {
      const event = createEvent('POST', `/leases/${testLeaseId}/versions`, {
        suite_id: testSuiteId,
        premises_rsf: 2500,
        term_months: 72,
        effective_daterange: '[2029-02-01,2035-01-31]',
        escalation_method: 'CPI',
        base_year: 2029,
        notes: 'First amendment - extended term'
      }, null, { id: testLeaseId });

      const response = await leasesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.version_number).toBe(1);
      expect(parsed.body.is_current).toBe(true);
    });
  });

  // Rent Schedule API Tests
  describe('Rent Schedule API', () => {
    
    test('POST /rent-schedules - Create rent period', async () => {
      const event = createEvent('POST', '/rent-schedules', {
        lease_version_id: testLeaseVersionId,
        period_daterange: '[2024-02-01,2024-12-31]',
        amount: 5000,
        basis: 'MONTH'
      });

      const response = await rentSchedulesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.amount).toBe('5000');
      expect(parsed.body.basis).toBe('MONTH');
    });

    test('GET /rent-schedules - List by lease version', async () => {
      const event = createEvent('GET', '/rent-schedules', null, { lease_version_id: testLeaseVersionId });

      const response = await rentSchedulesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.data).toBeDefined();
    });
  });

  // OpEx Pass-Through API Tests
  describe('OpEx Pass-Through API', () => {
    
    test('POST /opex-pass-throughs - Create OpEx config', async () => {
      const event = createEvent('POST', '/opex-pass-throughs', {
        lease_version_id: testLeaseVersionId,
        method: 'BASE_YEAR',
        stop_amount: 10.50,
        gross_up_pct: 95
      });

      const response = await opexHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.method).toBe('BASE_YEAR');
    });
  });

  // Option API Tests
  describe('Option API', () => {
    
    test('POST /options - Create renewal option', async () => {
      const event = createEvent('POST', '/options', {
        lease_version_id: testLeaseVersionId,
        option_type: 'RENEWAL',
        window_daterange: '[2028-07-01,2028-12-31]',
        terms: '5-year renewal at market rate'
      });

      const response = await optionsHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.option_type).toBe('RENEWAL');
    });
  });

  // Concession API Tests
  describe('Concession API', () => {
    
    test('POST /concessions - Create TI allowance', async () => {
      const event = createEvent('POST', '/concessions', {
        lease_version_id: testLeaseVersionId,
        kind: 'TI_ALLOWANCE',
        value_amount: 50000,
        value_basis: 'TOTAL'
      });

      const response = await concessionsHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.kind).toBe('TI_ALLOWANCE');
    });

    test('POST /concessions - Create free rent', async () => {
      const event = createEvent('POST', '/concessions', {
        lease_version_id: testLeaseVersionId,
        kind: 'FREE_RENT',
        applies_daterange: '[2024-02-01,2024-04-30]',
        notes: '3 months free rent'
      });

      const response = await concessionsHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.kind).toBe('FREE_RENT');
    });
  });

  // Critical Date API Tests
  describe('Critical Date API', () => {
    
    test('POST /critical-dates - Create expiration date', async () => {
      const event = createEvent('POST', '/critical-dates', {
        lease_id: testLeaseId,
        kind: 'EXPIRATION',
        date_value: '2029-01-31',
        notes: 'Lease expiration date'
      });

      const response = await criticalDatesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.kind).toBe('EXPIRATION');
    });
  });

  // Document Link API Tests
  describe('Document Link API', () => {
    
    test('POST /doc-links - Create document link', async () => {
      const event = createEvent('POST', '/doc-links', {
        lease_id: testLeaseId,
        label: 'Original Lease Agreement',
        external_ref: 'https://docs.example.com/lease-001.pdf'
      });

      const response = await docLinksHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(201);
      expect(parsed.body.label).toBe('Original Lease Agreement');
    });
  });

  // Reporting API Tests
  describe('Reporting API', () => {
    
    test('GET /reports/expirations - Get expirations report', async () => {
      const event = createEvent('GET', '/reports/expirations', null, { months: '12' });

      const response = await reportsHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.data).toBeDefined();
    });

    test('GET /reports/rent-roll - Get rent roll report', async () => {
      const event = createEvent('GET', '/reports/rent-roll');

      const response = await reportsHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.data).toBeDefined();
    });

    test('GET /reports/options - Get options status', async () => {
      const event = createEvent('GET', '/reports/options');

      const response = await reportsHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.data).toBeDefined();
    });
  });

  // Batch Operations API Tests
  describe('Batch Operations API', () => {
    
    test('POST /batch/properties - Batch create properties', async () => {
      const event = createEvent('POST', '/batch/properties', {
        operations: [
          {
            name: 'Batch Property 1',
            state: 'NY',
            total_rsf: 30000
          },
          {
            name: 'Batch Property 2',
            state: 'TX',
            total_rsf: 40000
          }
        ]
      });

      const response = await batchHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.results).toBeDefined();
      expect(parsed.body.summary.successful).toBeGreaterThan(0);
    });
  });

  // Authorization Tests
  describe('Authorization', () => {
    
    test('analyst_ro role - Can read properties', async () => {
      const event = createEvent('GET', '/properties', null, null, null, 'analyst_ro');

      const response = await propertiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(200);
    });

    test('analyst_ro role - Cannot create properties', async () => {
      const event = createEvent('POST', '/properties', {
        name: 'Unauthorized Property'
      }, null, null, 'analyst_ro');

      const response = await propertiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(403);
    });
  });

  // Error Handling Tests
  describe('Error Handling', () => {
    
    test('GET /properties/{id} - Not found error', async () => {
      const event = createEvent('GET', '/properties/99999', null, null, { id: '99999' });

      const response = await propertiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(404);
      expect(parsed.body.error.code).toBe('NOT_FOUND');
    });

    test('POST /properties - Validation error', async () => {
      const event = createEvent('POST', '/properties', {
        // Missing required 'name' field
        state: 'CA'
      });

      const response = await propertiesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(400);
      expect(parsed.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('POST /suites - Duplicate suite code error', async () => {
      const event = createEvent('POST', '/suites', {
        property_id: testPropertyId,
        suite_code: 'SUITE-101', // Already exists
        rsf: 1000
      });

      const response = await suitesHandler(event);
      const parsed = parseResponse(response);

      expect(parsed.statusCode).toBe(409);
    });
  });
});
