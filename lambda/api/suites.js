/**
 * Suite API Lambda Function
 * Handles CRUD operations for suites
 */

const db = require('./db');

/**
 * Lambda handler for suite endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const suiteId = pathParameters?.id || pathParameters?.suiteId;
    
    let result;
    
    switch (httpMethod) {
      case 'GET':
        if (suiteId) {
          result = await getSuite(suiteId);
        } else {
          result = await listSuites(queryStringParameters || {});
        }
        break;
        
      case 'POST':
        result = await createSuite(JSON.parse(body || '{}'));
        break;
        
      case 'PUT':
        if (!suiteId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Suite ID is required' 
            } 
          }, correlationId);
        }
        result = await updateSuite(suiteId, JSON.parse(body || '{}'));
        break;
        
      case 'DELETE':
        if (!suiteId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Suite ID is required' 
            } 
          }, correlationId);
        }
        result = await deleteSuite(suiteId);
        break;
        
      default:
        return createResponse(405, { 
          error: { 
            code: 'METHOD_NOT_ALLOWED', 
            message: `Method ${httpMethod} not allowed` 
          } 
        }, correlationId);
    }
    
    const duration = Date.now() - startTime;
    db.logger.logResponse(result.statusCode, correlationId, duration);
    
    return createResponse(result.statusCode, result.body, correlationId);
    
  } catch (error) {
    db.logger.error('Suite API error', error);
    
    // Handle authorization errors specially
    if (error.code === 'FORBIDDEN') {
      const duration = Date.now() - startTime;
      db.logger.logResponse(403, correlationId, duration);
      return db.authorization.createForbiddenResponse(error.details?.reason || 'Access denied', correlationId);
    }
    
    const errorResponse = db.createErrorResponse(error, correlationId);
    
    const duration = Date.now() - startTime;
    db.logger.logResponse(errorResponse.statusCode, correlationId, duration);
    
    return createResponse(errorResponse.statusCode, errorResponse.body, correlationId);
  }
};

/**
 * Get a single suite by ID
 */
async function getSuite(suiteId) {
  const query = `
    SELECT 
      s.suite_id,
      s.property_id,
      s.suite_code,
      s.rsf,
      s.created_at,
      s.updated_at,
      p.name as property_name,
      p.address as property_address
    FROM suite s
    LEFT JOIN property p ON s.property_id = p.property_id
    WHERE s.suite_id = $1
  `;
  
  const suite = await db.queryOne(query, [suiteId]);
  
  if (!suite) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Suite not found',
          details: [{ field: 'suite_id', value: suiteId }]
        }
      }
    };
  }
  
  return {
    statusCode: 200,
    body: suite
  };
}

/**
 * List suites with filtering by property_id
 */
async function listSuites(params) {
  const {
    property_id,
    suite_code,
    sort_by = 'suite_id',
    sort_order = 'ASC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['suite_id', 'property_id', 'suite_code', 'rsf', 'created_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'suite_id';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (property_id) {
    conditions.push(`s.property_id = $${paramCount}`);
    values.push(parseInt(property_id, 10));
    paramCount++;
  }
  
  if (suite_code) {
    conditions.push(`s.suite_code ILIKE $${paramCount}`);
    values.push(`%${suite_code}%`);
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM suite s
    ${whereClause}
  `;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      s.suite_id,
      s.property_id,
      s.suite_code,
      s.rsf,
      s.created_at,
      s.updated_at,
      p.name as property_name,
      p.address as property_address
    FROM suite s
    LEFT JOIN property p ON s.property_id = p.property_id
    ${whereClause}
    ORDER BY s.${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const suites = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: suites,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: suites.length
      }
    }
  };
}

/**
 * Create a new suite
 */
async function createSuite(data) {
  // Validate required fields
  const errors = await validateSuiteData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid suite data',
          details: errors
        }
      }
    };
  }
  
  const query = `
    INSERT INTO suite (
      property_id,
      suite_code,
      rsf
    ) VALUES ($1, $2, $3)
    RETURNING 
      suite_id,
      property_id,
      suite_code,
      rsf,
      created_at,
      updated_at
  `;
  
  const values = [
    data.property_id,
    data.suite_code,
    data.rsf || null
  ];
  
  const suite = await db.queryOne(query, values);
  
  return {
    statusCode: 201,
    body: suite
  };
}

/**
 * Update an existing suite
 */
async function updateSuite(suiteId, data) {
  // Check if suite exists
  const existingSuite = await db.queryOne(
    'SELECT suite_id FROM suite WHERE suite_id = $1',
    [suiteId]
  );
  
  if (!existingSuite) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Suite not found',
          details: [{ field: 'suite_id', value: suiteId }]
        }
      }
    };
  }
  
  // Validate update data
  const errors = await validateSuiteData(data, true, suiteId);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid suite data',
          details: errors
        }
      }
    };
  }
  
  // Build UPDATE query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  const allowedFields = ['property_id', 'suite_code', 'rsf'];
  
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${paramCount}`);
      values.push(data[field]);
      paramCount++;
    }
  });
  
  if (updates.length === 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No valid fields to update',
          details: []
        }
      }
    };
  }
  
  // Add updated_at
  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  
  // Add suite_id for WHERE clause
  values.push(suiteId);
  
  const query = `
    UPDATE suite
    SET ${updates.join(', ')}
    WHERE suite_id = $${paramCount}
    RETURNING 
      suite_id,
      property_id,
      suite_code,
      rsf,
      created_at,
      updated_at
  `;
  
  const suite = await db.queryOne(query, values);
  
  return {
    statusCode: 200,
    body: suite
  };
}

/**
 * Delete a suite (hard delete)
 */
async function deleteSuite(suiteId) {
  // Check if suite exists
  const existingSuite = await db.queryOne(
    'SELECT suite_id FROM suite WHERE suite_id = $1',
    [suiteId]
  );
  
  if (!existingSuite) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Suite not found',
          details: [{ field: 'suite_id', value: suiteId }]
        }
      }
    };
  }
  
  // Hard delete the suite
  const query = `
    DELETE FROM suite
    WHERE suite_id = $1
    RETURNING 
      suite_id,
      property_id,
      suite_code,
      rsf
  `;
  
  const suite = await db.queryOne(query, [suiteId]);
  
  return {
    statusCode: 200,
    body: {
      message: 'Suite deleted successfully',
      suite
    }
  };
}

/**
 * Validate suite data
 */
async function validateSuiteData(data, isUpdate = false, suiteId = null) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate) {
    if (!data.property_id) {
      errors.push({
        field: 'property_id',
        message: 'Property ID is required'
      });
    }
    
    if (!data.suite_code) {
      errors.push({
        field: 'suite_code',
        message: 'Suite code is required'
      });
    }
  }
  
  // Type validation
  if (data.property_id !== undefined) {
    const propertyId = parseInt(data.property_id, 10);
    if (isNaN(propertyId) || propertyId <= 0) {
      errors.push({
        field: 'property_id',
        message: 'Property ID must be a positive integer'
      });
    } else {
      // Validate that property exists
      const property = await db.queryOne(
        'SELECT property_id FROM property WHERE property_id = $1',
        [propertyId]
      );
      
      if (!property) {
        errors.push({
          field: 'property_id',
          message: 'Referenced property does not exist'
        });
      }
    }
  }
  
  if (data.suite_code !== undefined && typeof data.suite_code !== 'string') {
    errors.push({
      field: 'suite_code',
      message: 'Suite code must be a string'
    });
  }
  
  if (data.suite_code !== undefined && data.suite_code.length > 50) {
    errors.push({
      field: 'suite_code',
      message: 'Suite code must not exceed 50 characters'
    });
  }
  
  if (data.rsf !== undefined && data.rsf !== null) {
    const rsf = parseInt(data.rsf, 10);
    if (isNaN(rsf) || rsf < 0) {
      errors.push({
        field: 'rsf',
        message: 'RSF must be a non-negative integer'
      });
    }
  }
  
  // Check unique constraint (property_id, suite_code)
  if ((data.property_id !== undefined || data.suite_code !== undefined) && errors.length === 0) {
    let checkPropertyId = data.property_id;
    let checkSuiteCode = data.suite_code;
    
    // For updates, get current values if not provided
    if (isUpdate && suiteId) {
      const currentSuite = await db.queryOne(
        'SELECT property_id, suite_code FROM suite WHERE suite_id = $1',
        [suiteId]
      );
      
      if (currentSuite) {
        checkPropertyId = checkPropertyId || currentSuite.property_id;
        checkSuiteCode = checkSuiteCode || currentSuite.suite_code;
      }
    }
    
    if (checkPropertyId && checkSuiteCode) {
      const existingQuery = isUpdate && suiteId
        ? 'SELECT suite_id FROM suite WHERE property_id = $1 AND suite_code = $2 AND suite_id != $3'
        : 'SELECT suite_id FROM suite WHERE property_id = $1 AND suite_code = $2';
      
      const existingParams = isUpdate && suiteId
        ? [checkPropertyId, checkSuiteCode, suiteId]
        : [checkPropertyId, checkSuiteCode];
      
      const existing = await db.queryOne(existingQuery, existingParams);
      
      if (existing) {
        errors.push({
          field: 'suite_code',
          message: 'Suite code already exists for this property',
          constraint: 'uq_suite_property_code'
        });
      }
    }
  }
  
  return errors;
}

/**
 * Create HTTP response
 */
function createResponse(statusCode, body, correlationId = null) {
  const response = {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify(body)
  };
  
  if (correlationId) {
    response.headers['X-Correlation-ID'] = correlationId;
  }
  
  return response;
}
