/**
 * Unit Tests for API Utilities and Helpers
 * Tests validation, formatting, and utility functions
 */

const responseFormatter = require('../response-formatter');
const { DatabaseError } = require('../db/errors');

describe('Response Formatter Unit Tests', () => {
  
  describe('validateRequiredFields', () => {
    
    test('Returns empty array for valid data', () => {
      const body = { name: 'Test', value: 123 };
      const required = ['name', 'value'];
      
      const errors = responseFormatter.validateRequiredFields(body, required);
      
      expect(errors).toEqual([]);
    });
    
    test('Returns errors for missing fields', () => {
      const body = { name: 'Test' };
      const required = ['name', 'value'];
      
      const errors = responseFormatter.validateRequiredFields(body, required);
      
      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('value');
    });
    
    test('Returns errors for null fields', () => {
      const body = { name: null };
      const required = ['name'];
      
      const errors = responseFormatter.validateRequiredFields(body, required);
      
      expect(errors.length).toBe(1);
    });
    
    test('Returns errors for empty string fields', () => {
      const body = { name: '' };
      const required = ['name'];
      
      const errors = responseFormatter.validateRequiredFields(body, required);
      
      expect(errors.length).toBe(1);
    });
  });
  
  describe('validateFieldTypes', () => {
    
    test('Returns empty array for correct types', () => {
      const body = {
        name: 'Test',
        count: 123,
        active: true,
        tags: ['a', 'b']
      };
      const types = {
        name: 'string',
        count: 'number',
        active: 'boolean',
        tags: 'array'
      };
      
      const errors = responseFormatter.validateFieldTypes(body, types);
      
      expect(errors).toEqual([]);
    });
    
    test('Returns errors for incorrect types', () => {
      const body = {
        name: 123,
        count: 'not a number'
      };
      const types = {
        name: 'string',
        count: 'number'
      };
      
      const errors = responseFormatter.validateFieldTypes(body, types);
      
      expect(errors.length).toBe(2);
    });
    
    test('Validates array type correctly', () => {
      const body = { tags: 'not an array' };
      const types = { tags: 'array' };
      
      const errors = responseFormatter.validateFieldTypes(body, types);
      
      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('tags');
    });
  });
  
  describe('validateEnumValues', () => {
    
    test('Returns empty array for valid enum values', () => {
      const body = {
        status: 'ACTIVE',
        type: 'TENANT'
      };
      const enums = {
        status: ['ACTIVE', 'INACTIVE'],
        type: ['TENANT', 'LANDLORD']
      };
      
      const errors = responseFormatter.validateEnumValues(body, enums);
      
      expect(errors).toEqual([]);
    });
    
    test('Returns errors for invalid enum values', () => {
      const body = {
        status: 'INVALID'
      };
      const enums = {
        status: ['ACTIVE', 'INACTIVE']
      };
      
      const errors = responseFormatter.validateEnumValues(body, enums);
      
      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('status');
    });
  });
  
  describe('createSuccessResponse', () => {
    
    test('Creates response with correct structure', () => {
      const data = { id: 1, name: 'Test' };
      
      const response = responseFormatter.createSuccessResponse(data);
      
      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(data);
      expect(body.metadata).toBeDefined();
      expect(body.metadata.request_id).toBeDefined();
    });
    
    test('Includes pagination when provided', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const pagination = {
        page: 1,
        page_size: 10,
        total_count: 50
      };
      
      const response = responseFormatter.createSuccessResponse(data, { pagination });
      const body = JSON.parse(response.body);
      
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total_pages).toBe(5);
    });
    
    test('Uses custom status code', () => {
      const data = { id: 1 };
      
      const response = responseFormatter.createSuccessResponse(data, { statusCode: 201 });
      
      expect(response.statusCode).toBe(201);
    });
  });
  
  describe('createNotFoundResponse', () => {
    
    test('Creates 404 response with correct structure', () => {
      const response = responseFormatter.createNotFoundResponse('Property', 123);
      
      expect(response.statusCode).toBe(404);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Property');
    });
  });
  
  describe('createValidationErrorResponse', () => {
    
    test('Creates 400 response with validation errors', () => {
      const errors = [
        { field: 'name', message: 'Name is required' },
        { field: 'email', message: 'Invalid email format' }
      ];
      
      const response = responseFormatter.createValidationErrorResponse(errors);
      
      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual(errors);
    });
  });
  
  describe('createForbiddenResponse', () => {
    
    test('Creates 403 response', () => {
      const response = responseFormatter.createForbiddenResponse('Access denied');
      
      expect(response.statusCode).toBe(403);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });
});

describe('Property Validation Unit Tests', () => {
  
  // Mock the properties module validation function
  const validatePropertyData = (data, isUpdate = false) => {
    const errors = [];
    
    if (!isUpdate && !data.name) {
      errors.push({ field: 'name', message: 'Property name is required' });
    }
    
    if (data.name !== undefined && typeof data.name !== 'string') {
      errors.push({ field: 'name', message: 'Property name must be a string' });
    }
    
    if (data.name !== undefined && data.name.length > 255) {
      errors.push({ field: 'name', message: 'Property name must not exceed 255 characters' });
    }
    
    if (data.total_rsf !== undefined && data.total_rsf !== null) {
      const rsf = parseInt(data.total_rsf, 10);
      if (isNaN(rsf) || rsf < 0) {
        errors.push({ field: 'total_rsf', message: 'Total RSF must be a non-negative integer' });
      }
    }
    
    return errors;
  };
  
  test('Valid property data passes validation', () => {
    const data = {
      name: 'Test Building',
      total_rsf: 50000
    };
    
    const errors = validatePropertyData(data);
    
    expect(errors).toEqual([]);
  });
  
  test('Missing name fails validation for create', () => {
    const data = { total_rsf: 50000 };
    
    const errors = validatePropertyData(data, false);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('name');
  });
  
  test('Missing name passes validation for update', () => {
    const data = { total_rsf: 50000 };
    
    const errors = validatePropertyData(data, true);
    
    expect(errors).toEqual([]);
  });
  
  test('Invalid RSF fails validation', () => {
    const data = {
      name: 'Test Building',
      total_rsf: -100
    };
    
    const errors = validatePropertyData(data);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('total_rsf');
  });
  
  test('Name too long fails validation', () => {
    const data = {
      name: 'x'.repeat(300)
    };
    
    const errors = validatePropertyData(data);
    
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('Event Helper Unit Tests', () => {
  
  const createEvent = (httpMethod, path, body = null, queryParams = null, pathParams = null) => {
    return {
      httpMethod,
      path,
      body: body ? JSON.stringify(body) : null,
      queryStringParameters: queryParams,
      pathParameters: pathParams,
      requestContext: {
        authorizer: {
          role: 'lease_app_rw',
          principalId: 'test-user'
        }
      },
      headers: {
        'Content-Type': 'application/json'
      }
    };
  };
  
  test('Creates GET event correctly', () => {
    const event = createEvent('GET', '/properties', null, { limit: '10' });
    
    expect(event.httpMethod).toBe('GET');
    expect(event.queryStringParameters.limit).toBe('10');
    expect(event.body).toBeNull();
  });
  
  test('Creates POST event with body', () => {
    const body = { name: 'Test' };
    const event = createEvent('POST', '/properties', body);
    
    expect(event.httpMethod).toBe('POST');
    expect(event.body).toBe(JSON.stringify(body));
  });
  
  test('Creates event with path parameters', () => {
    const event = createEvent('GET', '/properties/123', null, null, { id: '123' });
    
    expect(event.pathParameters.id).toBe('123');
  });
});
