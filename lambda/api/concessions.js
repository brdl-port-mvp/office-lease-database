/**
 * Concession API Lambda Function
 * Handles CRUD operations for lease concessions (TI allowances, free rent, etc.)
 */

const db = require('./db');

// Valid kind values as per schema
const VALID_KIND_VALUES = ['TI_ALLOWANCE', 'FREE_RENT', 'OTHER'];

// Valid value_basis values as per schema
const VALID_VALUE_BASIS_VALUES = ['TOTAL', 'PER_SF'];

/**
 * Lambda handler for concession endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const concessionId = pathParameters?.id;
    
    let result;
    
    switch (httpMethod) {
      case 'GET':
        if (concessionId) {
          result = await getConcession(concessionId);
        } else {
          result = await listConcessions(queryStringParameters || {});
        }
        break;
        
      case 'POST':
        result = await createConcession(JSON.parse(body || '{}'));
        break;
        
      case 'PUT':
        if (!concessionId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Concession ID is required' 
            } 
          }, correlationId);
        }
        result = await updateConcession(concessionId, JSON.parse(body || '{}'));
        break;
        
      case 'DELETE':
        if (!concessionId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Concession ID is required' 
            } 
          }, correlationId);
        }
        result = await deleteConcession(concessionId);
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
    db.logger.error('Concession API error', error);
    
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
 * Get a single concession by ID with months_remaining calculation
 */
async function getConcession(concessionId) {
  const query = `
    SELECT 
      c.concession_id,
      c.lease_version_id,
      c.kind,
      c.value_amount,
      c.value_basis,
      c.applies_daterange,
      c.notes,
      c.created_at,
      c.updated_at,
      CASE 
        WHEN c.kind = 'FREE_RENT' 
          AND c.applies_daterange IS NOT NULL 
          AND UPPER(c.applies_daterange) > CURRENT_DATE 
        THEN ROUND(EXTRACT(EPOCH FROM (UPPER(c.applies_daterange) - CURRENT_DATE)) / (30 * 86400), 1)
        ELSE NULL
      END as months_remaining
    FROM concession c
    WHERE c.concession_id = $1
  `;
  
  const concession = await db.queryOne(query, [concessionId]);
  
  if (!concession) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Concession not found',
          details: [{ field: 'concession_id', value: concessionId }]
        }
      }
    };
  }
  
  return {
    statusCode: 200,
    body: concession
  };
}

/**
 * List concessions with filtering by lease_version_id
 */
async function listConcessions(params) {
  const {
    lease_version_id,
    kind,
    value_basis,
    sort_by = 'concession_id',
    sort_order = 'ASC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['concession_id', 'kind', 'value_amount', 'value_basis', 'created_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'concession_id';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (lease_version_id) {
    conditions.push(`c.lease_version_id = $${paramCount}`);
    values.push(parseInt(lease_version_id, 10));
    paramCount++;
  }
  
  if (kind) {
    const kindUpper = kind.toUpperCase();
    if (VALID_KIND_VALUES.includes(kindUpper)) {
      conditions.push(`c.kind = $${paramCount}`);
      values.push(kindUpper);
      paramCount++;
    }
  }
  
  if (value_basis) {
    const valueBasisUpper = value_basis.toUpperCase();
    if (VALID_VALUE_BASIS_VALUES.includes(valueBasisUpper)) {
      conditions.push(`c.value_basis = $${paramCount}`);
      values.push(valueBasisUpper);
      paramCount++;
    }
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM concession c
    ${whereClause}
  `;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results with months_remaining calculation
  const dataQuery = `
    SELECT 
      c.concession_id,
      c.lease_version_id,
      c.kind,
      c.value_amount,
      c.value_basis,
      c.applies_daterange,
      c.notes,
      c.created_at,
      c.updated_at,
      CASE 
        WHEN c.kind = 'FREE_RENT' 
          AND c.applies_daterange IS NOT NULL 
          AND UPPER(c.applies_daterange) > CURRENT_DATE 
        THEN ROUND(EXTRACT(EPOCH FROM (UPPER(c.applies_daterange) - CURRENT_DATE)) / (30 * 86400), 1)
        ELSE NULL
      END as months_remaining
    FROM concession c
    ${whereClause}
    ORDER BY c.${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const concessions = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: concessions,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: concessions.length
      }
    }
  };
}

/**
 * Create a new concession
 */
async function createConcession(data) {
  // Validate required fields
  const errors = validateConcessionData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid concession data',
          details: errors
        }
      }
    };
  }
  
  // Validate lease_version_id exists
  const leaseVersion = await db.queryOne(
    'SELECT lease_version_id FROM lease_version WHERE lease_version_id = $1',
    [data.lease_version_id]
  );
  
  if (!leaseVersion) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'INVALID_REFERENCE',
          message: 'Lease version not found',
          details: [{ field: 'lease_version_id', value: data.lease_version_id }]
        }
      }
    };
  }
  
  const query = `
    INSERT INTO concession (
      lease_version_id,
      kind,
      value_amount,
      value_basis,
      applies_daterange,
      notes
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING 
      concession_id,
      lease_version_id,
      kind,
      value_amount,
      value_basis,
      applies_daterange,
      notes,
      created_at,
      updated_at
  `;
  
  const values = [
    data.lease_version_id,
    data.kind.toUpperCase(),
    data.value_amount || null,
    data.value_basis ? data.value_basis.toUpperCase() : null,
    data.applies_daterange || null,
    data.notes || null
  ];
  
  const concession = await db.queryOne(query, values);
  
  return {
    statusCode: 201,
    body: concession
  };
}

/**
 * Update an existing concession
 */
async function updateConcession(concessionId, data) {
  // Check if concession exists
  const existingConcession = await db.queryOne(
    'SELECT concession_id FROM concession WHERE concession_id = $1',
    [concessionId]
  );
  
  if (!existingConcession) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Concession not found',
          details: [{ field: 'concession_id', value: concessionId }]
        }
      }
    };
  }
  
  // Validate update data
  const errors = validateConcessionData(data, true);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid concession data',
          details: errors
        }
      }
    };
  }
  
  // Build UPDATE query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  const allowedFields = ['kind', 'value_amount', 'value_basis', 'applies_daterange', 'notes'];
  
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${paramCount}`);
      // Uppercase enum values
      let value = data[field];
      if (field === 'kind' || field === 'value_basis') {
        value = data[field].toUpperCase();
      }
      values.push(value);
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
  
  // Add concession_id for WHERE clause
  values.push(concessionId);
  
  const query = `
    UPDATE concession
    SET ${updates.join(', ')}
    WHERE concession_id = $${paramCount}
    RETURNING 
      concession_id,
      lease_version_id,
      kind,
      value_amount,
      value_basis,
      applies_daterange,
      notes,
      created_at,
      updated_at
  `;
  
  const concession = await db.queryOne(query, values);
  
  return {
    statusCode: 200,
    body: concession
  };
}

/**
 * Delete a concession
 */
async function deleteConcession(concessionId) {
  // Check if concession exists
  const existingConcession = await db.queryOne(
    'SELECT concession_id FROM concession WHERE concession_id = $1',
    [concessionId]
  );
  
  if (!existingConcession) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Concession not found',
          details: [{ field: 'concession_id', value: concessionId }]
        }
      }
    };
  }
  
  const query = 'DELETE FROM concession WHERE concession_id = $1';
  
  await db.query(query, [concessionId]);
  
  return {
    statusCode: 204,
    body: null
  };
}

/**
 * Validate concession data
 */
function validateConcessionData(data, isUpdate = false) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate) {
    if (!data.lease_version_id) {
      errors.push({
        field: 'lease_version_id',
        message: 'Lease version ID is required'
      });
    }
    
    if (!data.kind) {
      errors.push({
        field: 'kind',
        message: 'Kind is required'
      });
    }
    
    if (data.value_amount === undefined || data.value_amount === null || data.value_amount === '') {
      errors.push({
        field: 'value_amount',
        message: 'Value amount is required'
      });
    }
    
    if (!data.value_basis || data.value_basis === '') {
      errors.push({
        field: 'value_basis',
        message: 'Value basis is required'
      });
    }
  }
  
  // Type validation
  if (data.lease_version_id !== undefined) {
    const leaseVersionId = parseInt(data.lease_version_id, 10);
    if (isNaN(leaseVersionId) || leaseVersionId <= 0) {
      errors.push({
        field: 'lease_version_id',
        message: 'Lease version ID must be a positive integer'
      });
    }
  }
  
  // Validate kind enum
  if (data.kind !== undefined) {
    if (typeof data.kind !== 'string') {
      errors.push({
        field: 'kind',
        message: 'Kind must be a string'
      });
    } else if (!VALID_KIND_VALUES.includes(data.kind.toUpperCase())) {
      errors.push({
        field: 'kind',
        message: `Kind must be one of: ${VALID_KIND_VALUES.join(', ')}`,
        allowed_values: VALID_KIND_VALUES
      });
    }
  }
  
  // Validate value_amount
  if (data.value_amount !== undefined && data.value_amount !== null) {
    const valueAmount = parseFloat(data.value_amount);
    if (isNaN(valueAmount) || valueAmount < 0) {
      errors.push({
        field: 'value_amount',
        message: 'Value amount must be a non-negative number'
      });
    }
  }
  
  // Validate value_basis enum
  if (data.value_basis !== undefined) {
    if (typeof data.value_basis !== 'string') {
      errors.push({
        field: 'value_basis',
        message: 'Value basis must be a string'
      });
    } else if (!VALID_VALUE_BASIS_VALUES.includes(data.value_basis.toUpperCase())) {
      errors.push({
        field: 'value_basis',
        message: `Value basis must be one of: ${VALID_VALUE_BASIS_VALUES.join(', ')}`,
        allowed_values: VALID_VALUE_BASIS_VALUES
      });
    }
  }
  
  // Validate applies_daterange format (optional)
  if (data.applies_daterange !== undefined && data.applies_daterange !== null) {
    if (typeof data.applies_daterange !== 'string') {
      errors.push({
        field: 'applies_daterange',
        message: 'Applies date range must be a string in PostgreSQL daterange format (e.g., "[2024-01-01,2025-01-01)")'
      });
    } else {
      // Basic format validation for daterange
      const daterangeRegex = /^[\[\(]\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}[\]\)]$/;
      if (!daterangeRegex.test(data.applies_daterange)) {
        errors.push({
          field: 'applies_daterange',
          message: 'Applies date range must be in PostgreSQL daterange format (e.g., "[2024-01-01,2025-01-01)")'
        });
      }
    }
  }
  
  // Validate notes (optional)
  if (data.notes !== undefined && data.notes !== null) {
    if (typeof data.notes !== 'string') {
      errors.push({
        field: 'notes',
        message: 'Notes must be a string'
      });
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
    body: statusCode === 204 ? '' : JSON.stringify(body)
  };
  
  if (correlationId) {
    response.headers['X-Correlation-ID'] = correlationId;
  }
  
  return response;
}

module.exports = {
  handler: exports.handler
};
