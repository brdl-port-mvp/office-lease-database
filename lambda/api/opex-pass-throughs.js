/**
 * OpEx Pass-Through API Lambda Function
 * Handles CRUD operations for operating expense pass-through configurations
 */

const db = require('./db');

// Valid method values as per schema
const VALID_METHOD_VALUES = ['BASE_YEAR', 'EXPENSE_STOP', 'NNN', 'OTHER'];

/**
 * Lambda handler for OpEx pass-through endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const opexId = pathParameters?.id;
    
    let result;
    
    switch (httpMethod) {
      case 'GET':
        if (opexId) {
          result = await getOpexPassThrough(opexId);
        } else {
          result = await listOpexPassThroughs(queryStringParameters || {});
        }
        break;
        
      case 'POST':
        result = await createOpexPassThrough(JSON.parse(body || '{}'));
        break;
        
      case 'PUT':
        if (!opexId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'OpEx pass-through ID is required' 
            } 
          }, correlationId);
        }
        result = await updateOpexPassThrough(opexId, JSON.parse(body || '{}'));
        break;
        
      case 'DELETE':
        if (!opexId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'OpEx pass-through ID is required' 
            } 
          }, correlationId);
        }
        result = await deleteOpexPassThrough(opexId);
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
    db.logger.error('OpEx Pass-Through API error', error);
    
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
 * Get a single OpEx pass-through by ID
 */
async function getOpexPassThrough(opexId) {
  const query = `
    SELECT 
      opex_id,
      lease_version_id,
      method,
      stop_amount,
      gross_up_pct,
      notes,
      created_at,
      updated_at
    FROM opex_pass_through
    WHERE opex_id = $1
  `;
  
  const opexPassThrough = await db.queryOne(query, [opexId]);
  
  if (!opexPassThrough) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'OpEx pass-through not found',
          details: [{ field: 'opex_id', value: opexId }]
        }
      }
    };
  }
  
  return {
    statusCode: 200,
    body: opexPassThrough
  };
}

/**
 * List OpEx pass-throughs with filtering by lease_version_id
 */
async function listOpexPassThroughs(params) {
  const {
    lease_version_id,
    method,
    sort_by = 'opex_id',
    sort_order = 'ASC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['opex_id', 'method', 'stop_amount', 'created_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'opex_id';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (lease_version_id) {
    conditions.push(`opt.lease_version_id = $${paramCount}`);
    values.push(parseInt(lease_version_id, 10));
    paramCount++;
  }
  
  if (method) {
    const methodUpper = method.toUpperCase();
    if (VALID_METHOD_VALUES.includes(methodUpper)) {
      conditions.push(`opt.method = $${paramCount}`);
      values.push(methodUpper);
      paramCount++;
    }
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM opex_pass_through opt
    ${whereClause}
  `;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      opt.opex_id,
      opt.lease_version_id,
      opt.method,
      opt.stop_amount,
      opt.gross_up_pct,
      opt.notes,
      opt.created_at,
      opt.updated_at
    FROM opex_pass_through opt
    ${whereClause}
    ORDER BY opt.${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const opexPassThroughs = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: opexPassThroughs,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: opexPassThroughs.length
      }
    }
  };
}

/**
 * Create a new OpEx pass-through configuration
 */
async function createOpexPassThrough(data) {
  // Validate required fields
  const errors = validateOpexPassThroughData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid OpEx pass-through data',
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
    INSERT INTO opex_pass_through (
      lease_version_id,
      method,
      stop_amount,
      gross_up_pct,
      notes
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING 
      opex_id,
      lease_version_id,
      method,
      stop_amount,
      gross_up_pct,
      notes,
      created_at,
      updated_at
  `;
  
  const values = [
    data.lease_version_id,
    data.method.toUpperCase(),
    data.stop_amount || null,
    data.gross_up_pct || null,
    data.notes || null
  ];
  
  const opexPassThrough = await db.queryOne(query, values);
  
  return {
    statusCode: 201,
    body: opexPassThrough
  };
}

/**
 * Update an existing OpEx pass-through configuration
 */
async function updateOpexPassThrough(opexId, data) {
  // Check if OpEx pass-through exists
  const existingOpex = await db.queryOne(
    'SELECT opex_id FROM opex_pass_through WHERE opex_id = $1',
    [opexId]
  );
  
  if (!existingOpex) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'OpEx pass-through not found',
          details: [{ field: 'opex_id', value: opexId }]
        }
      }
    };
  }
  
  // Validate update data
  const errors = validateOpexPassThroughData(data, true);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid OpEx pass-through data',
          details: errors
        }
      }
    };
  }
  
  // Build UPDATE query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  const allowedFields = ['method', 'stop_amount', 'gross_up_pct', 'notes'];
  
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${paramCount}`);
      // Uppercase method value
      const value = field === 'method' ? data[field].toUpperCase() : data[field];
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
  
  // Add opex_id for WHERE clause
  values.push(opexId);
  
  const query = `
    UPDATE opex_pass_through
    SET ${updates.join(', ')}
    WHERE opex_id = $${paramCount}
    RETURNING 
      opex_id,
      lease_version_id,
      method,
      stop_amount,
      gross_up_pct,
      notes,
      created_at,
      updated_at
  `;
  
  const opexPassThrough = await db.queryOne(query, values);
  
  return {
    statusCode: 200,
    body: opexPassThrough
  };
}

/**
 * Delete an OpEx pass-through configuration
 */
async function deleteOpexPassThrough(opexId) {
  // Check if OpEx pass-through exists
  const existingOpex = await db.queryOne(
    'SELECT opex_id FROM opex_pass_through WHERE opex_id = $1',
    [opexId]
  );
  
  if (!existingOpex) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'OpEx pass-through not found',
          details: [{ field: 'opex_id', value: opexId }]
        }
      }
    };
  }
  
  const query = 'DELETE FROM opex_pass_through WHERE opex_id = $1';
  
  await db.query(query, [opexId]);
  
  return {
    statusCode: 204,
    body: null
  };
}

/**
 * Validate OpEx pass-through data
 */
function validateOpexPassThroughData(data, isUpdate = false) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate) {
    if (!data.lease_version_id) {
      errors.push({
        field: 'lease_version_id',
        message: 'Lease version ID is required'
      });
    }
    
    if (!data.method) {
      errors.push({
        field: 'method',
        message: 'Method is required'
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
  
  // Validate method enum
  if (data.method !== undefined) {
    if (typeof data.method !== 'string') {
      errors.push({
        field: 'method',
        message: 'Method must be a string'
      });
    } else if (!VALID_METHOD_VALUES.includes(data.method.toUpperCase())) {
      errors.push({
        field: 'method',
        message: `Method must be one of: ${VALID_METHOD_VALUES.join(', ')}`,
        allowed_values: VALID_METHOD_VALUES
      });
    }
  }
  
  // Validate stop_amount (optional)
  if (data.stop_amount !== undefined && data.stop_amount !== null) {
    const stopAmount = parseFloat(data.stop_amount);
    if (isNaN(stopAmount) || stopAmount < 0) {
      errors.push({
        field: 'stop_amount',
        message: 'Stop amount must be a non-negative number'
      });
    }
  }
  
  // Validate gross_up_pct (optional)
  if (data.gross_up_pct !== undefined && data.gross_up_pct !== null) {
    const grossUpPct = parseFloat(data.gross_up_pct);
    if (isNaN(grossUpPct) || grossUpPct < 0 || grossUpPct > 100) {
      errors.push({
        field: 'gross_up_pct',
        message: 'Gross-up percentage must be a number between 0 and 100'
      });
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
