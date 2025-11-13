/**
 * Critical Date API Lambda Function
 * Handles CRUD operations for lease critical dates (commencement, rent start, expiration, notice deadlines)
 */

const db = require('./db');

// Valid kind values as per schema
const VALID_KIND_VALUES = ['COMMENCEMENT', 'RENT_START', 'EXPIRATION', 'NOTICE', 'OTHER'];

/**
 * Lambda handler for critical date endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const critId = pathParameters?.id;
    
    let result;
    
    switch (httpMethod) {
      case 'GET':
        if (critId) {
          result = await getCriticalDate(critId);
        } else {
          result = await listCriticalDates(queryStringParameters || {});
        }
        break;
        
      case 'POST':
        result = await createCriticalDate(JSON.parse(body || '{}'));
        break;
        
      case 'PUT':
        if (!critId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Critical date ID is required' 
            } 
          }, correlationId);
        }
        result = await updateCriticalDate(critId, JSON.parse(body || '{}'));
        break;
        
      case 'DELETE':
        if (!critId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Critical date ID is required' 
            } 
          }, correlationId);
        }
        result = await deleteCriticalDate(critId);
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
    db.logger.error('Critical Date API error', error);
    
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
 * Get a single critical date by ID
 */
async function getCriticalDate(critId) {
  const query = `
    SELECT 
      cd.crit_id,
      cd.lease_id,
      cd.kind,
      cd.date_value,
      cd.notes,
      cd.created_at,
      cd.updated_at
    FROM critical_date cd
    WHERE cd.crit_id = $1
  `;
  
  const criticalDate = await db.queryOne(query, [critId]);
  
  if (!criticalDate) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Critical date not found',
          details: [{ field: 'crit_id', value: critId }]
        }
      }
    };
  }
  
  return {
    statusCode: 200,
    body: criticalDate
  };
}

/**
 * List critical dates with filtering by lease_id
 */
async function listCriticalDates(params) {
  const {
    lease_id,
    kind,
    sort_by = 'date_value',
    sort_order = 'ASC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['crit_id', 'kind', 'date_value', 'created_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'date_value';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (lease_id) {
    conditions.push(`cd.lease_id = $${paramCount}`);
    values.push(parseInt(lease_id, 10));
    paramCount++;
  }
  
  if (kind) {
    const kindUpper = kind.toUpperCase();
    if (VALID_KIND_VALUES.includes(kindUpper)) {
      conditions.push(`cd.kind = $${paramCount}`);
      values.push(kindUpper);
      paramCount++;
    }
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM critical_date cd
    ${whereClause}
  `;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      cd.crit_id,
      cd.lease_id,
      cd.kind,
      cd.date_value,
      cd.notes,
      cd.created_at,
      cd.updated_at
    FROM critical_date cd
    ${whereClause}
    ORDER BY cd.${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const criticalDates = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: criticalDates,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: criticalDates.length
      }
    }
  };
}

/**
 * Create a new critical date
 */
async function createCriticalDate(data) {
  // Validate required fields
  const errors = validateCriticalDateData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid critical date data',
          details: errors
        }
      }
    };
  }
  
  // Validate lease_id exists
  const lease = await db.queryOne(
    'SELECT lease_id FROM lease WHERE lease_id = $1',
    [data.lease_id]
  );
  
  if (!lease) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'INVALID_REFERENCE',
          message: 'Lease not found',
          details: [{ field: 'lease_id', value: data.lease_id }]
        }
      }
    };
  }
  
  const query = `
    INSERT INTO critical_date (
      lease_id,
      kind,
      date_value,
      notes
    ) VALUES ($1, $2, $3, $4)
    RETURNING 
      crit_id,
      lease_id,
      kind,
      date_value,
      notes,
      created_at,
      updated_at
  `;
  
  const values = [
    data.lease_id,
    data.kind.toUpperCase(),
    data.date_value,
    data.notes || null
  ];
  
  const criticalDate = await db.queryOne(query, values);
  
  return {
    statusCode: 201,
    body: criticalDate
  };
}

/**
 * Update an existing critical date
 */
async function updateCriticalDate(critId, data) {
  // Check if critical date exists
  const existingCriticalDate = await db.queryOne(
    'SELECT crit_id FROM critical_date WHERE crit_id = $1',
    [critId]
  );
  
  if (!existingCriticalDate) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Critical date not found',
          details: [{ field: 'crit_id', value: critId }]
        }
      }
    };
  }
  
  // Validate update data
  const errors = validateCriticalDateData(data, true);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid critical date data',
          details: errors
        }
      }
    };
  }
  
  // Build UPDATE query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  const allowedFields = ['kind', 'date_value', 'notes'];
  
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${paramCount}`);
      // Uppercase kind value
      const value = field === 'kind' ? data[field].toUpperCase() : data[field];
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
  
  // Add crit_id for WHERE clause
  values.push(critId);
  
  const query = `
    UPDATE critical_date
    SET ${updates.join(', ')}
    WHERE crit_id = $${paramCount}
    RETURNING 
      crit_id,
      lease_id,
      kind,
      date_value,
      notes,
      created_at,
      updated_at
  `;
  
  const criticalDate = await db.queryOne(query, values);
  
  return {
    statusCode: 200,
    body: criticalDate
  };
}

/**
 * Delete a critical date
 */
async function deleteCriticalDate(critId) {
  // Check if critical date exists
  const existingCriticalDate = await db.queryOne(
    'SELECT crit_id FROM critical_date WHERE crit_id = $1',
    [critId]
  );
  
  if (!existingCriticalDate) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Critical date not found',
          details: [{ field: 'crit_id', value: critId }]
        }
      }
    };
  }
  
  const query = 'DELETE FROM critical_date WHERE crit_id = $1';
  
  await db.query(query, [critId]);
  
  return {
    statusCode: 204,
    body: null
  };
}

/**
 * Validate critical date data
 */
function validateCriticalDateData(data, isUpdate = false) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate) {
    if (!data.lease_id) {
      errors.push({
        field: 'lease_id',
        message: 'Lease ID is required'
      });
    }
    
    if (!data.kind) {
      errors.push({
        field: 'kind',
        message: 'Kind is required'
      });
    }
    
    if (!data.date_value) {
      errors.push({
        field: 'date_value',
        message: 'Date value is required'
      });
    }
  }
  
  // Type validation
  if (data.lease_id !== undefined) {
    const leaseId = parseInt(data.lease_id, 10);
    if (isNaN(leaseId) || leaseId <= 0) {
      errors.push({
        field: 'lease_id',
        message: 'Lease ID must be a positive integer'
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
  
  // Validate date_value format
  if (data.date_value !== undefined) {
    if (typeof data.date_value !== 'string') {
      errors.push({
        field: 'date_value',
        message: 'Date value must be a string in YYYY-MM-DD format'
      });
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(data.date_value)) {
        errors.push({
          field: 'date_value',
          message: 'Date value must be in YYYY-MM-DD format'
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
