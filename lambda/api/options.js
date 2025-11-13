/**
 * Option API Lambda Function
 * Handles CRUD operations for lease options (renewal, termination, expansion, ROFR)
 */

const db = require('./db');

// Valid option_type values as per schema
const VALID_OPTION_TYPES = ['RENEWAL', 'TERMINATION', 'EXPANSION', 'ROFR', 'OTHER'];

/**
 * Lambda handler for option endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body, path } = event;
    const optionId = pathParameters?.id;
    
    let result;
    
    // Check if this is an exercise endpoint
    if (path && path.includes('/exercise')) {
      if (httpMethod === 'PUT') {
        if (!optionId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Option ID is required' 
            } 
          }, correlationId);
        }
        result = await exerciseOption(optionId, JSON.parse(body || '{}'));
      } else {
        return createResponse(405, { 
          error: { 
            code: 'METHOD_NOT_ALLOWED', 
            message: `Method ${httpMethod} not allowed for exercise endpoint` 
          } 
        }, correlationId);
      }
    } else {
      // Handle option CRUD operations
      switch (httpMethod) {
        case 'GET':
          if (optionId) {
            result = await getOption(optionId);
          } else {
            result = await listOptions(queryStringParameters || {});
          }
          break;
          
        case 'POST':
          result = await createOption(JSON.parse(body || '{}'));
          break;
          
        case 'PUT':
          if (!optionId) {
            return createResponse(400, { 
              error: { 
                code: 'VALIDATION_ERROR', 
                message: 'Option ID is required' 
              } 
            }, correlationId);
          }
          result = await updateOption(optionId, JSON.parse(body || '{}'));
          break;
          
        case 'DELETE':
          if (!optionId) {
            return createResponse(400, { 
              error: { 
                code: 'VALIDATION_ERROR', 
                message: 'Option ID is required' 
              } 
            }, correlationId);
          }
          result = await deleteOption(optionId);
          break;
          
        default:
          return createResponse(405, { 
            error: { 
              code: 'METHOD_NOT_ALLOWED', 
              message: `Method ${httpMethod} not allowed` 
            } 
          }, correlationId);
      }
    }
    
    const duration = Date.now() - startTime;
    db.logger.logResponse(result.statusCode, correlationId, duration);
    
    return createResponse(result.statusCode, result.body, correlationId);
    
  } catch (error) {
    db.logger.error('Option API error', error);
    
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
 * Get a single option by ID with notice window status
 */
async function getOption(optionId) {
  const query = `
    SELECT 
      o.option_id,
      o.lease_version_id,
      o.option_type,
      o.window_daterange,
      o.terms,
      o.exercised,
      o.exercised_date,
      o.created_at,
      o.updated_at,
      CASE 
        WHEN o.window_daterange @> CURRENT_DATE THEN TRUE
        ELSE FALSE
      END as notice_window_open
    FROM option o
    WHERE o.option_id = $1
  `;
  
  const option = await db.queryOne(query, [optionId]);
  
  if (!option) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Option not found',
          details: [{ field: 'option_id', value: optionId }]
        }
      }
    };
  }
  
  return {
    statusCode: 200,
    body: option
  };
}

/**
 * List options with filtering by lease_version_id and window status
 */
async function listOptions(params) {
  const {
    lease_version_id,
    option_type,
    window_status,
    exercised,
    sort_by = 'option_id',
    sort_order = 'ASC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['option_id', 'option_type', 'window_daterange', 'exercised', 'created_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'option_id';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (lease_version_id) {
    conditions.push(`o.lease_version_id = $${paramCount}`);
    values.push(parseInt(lease_version_id, 10));
    paramCount++;
  }
  
  if (option_type) {
    const optionTypeUpper = option_type.toUpperCase();
    if (VALID_OPTION_TYPES.includes(optionTypeUpper)) {
      conditions.push(`o.option_type = $${paramCount}`);
      values.push(optionTypeUpper);
      paramCount++;
    }
  }
  
  if (exercised !== undefined) {
    const exercisedBool = exercised === 'true' || exercised === true;
    conditions.push(`o.exercised = $${paramCount}`);
    values.push(exercisedBool);
    paramCount++;
  }
  
  // Add window_status filter (open/closed)
  if (window_status === 'open') {
    conditions.push(`o.window_daterange @> CURRENT_DATE`);
  } else if (window_status === 'closed') {
    conditions.push(`NOT (o.window_daterange @> CURRENT_DATE)`);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM option o
    ${whereClause}
  `;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      o.option_id,
      o.lease_version_id,
      o.option_type,
      o.window_daterange,
      o.terms,
      o.exercised,
      o.exercised_date,
      o.created_at,
      o.updated_at,
      CASE 
        WHEN o.window_daterange @> CURRENT_DATE THEN TRUE
        ELSE FALSE
      END as notice_window_open
    FROM option o
    ${whereClause}
    ORDER BY o.${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const options = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: options,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: options.length
      }
    }
  };
}

/**
 * Create a new option with window_daterange
 */
async function createOption(data) {
  // Validate required fields
  const errors = validateOptionData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid option data',
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
    INSERT INTO option (
      lease_version_id,
      option_type,
      window_daterange,
      terms,
      exercised,
      exercised_date
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING 
      option_id,
      lease_version_id,
      option_type,
      window_daterange,
      terms,
      exercised,
      exercised_date,
      created_at,
      updated_at
  `;
  
  const values = [
    data.lease_version_id,
    data.option_type.toUpperCase(),
    data.window_daterange,
    data.terms || null,
    data.exercised !== undefined ? data.exercised : false,
    data.exercised_date || null
  ];
  
  const option = await db.queryOne(query, values);
  
  return {
    statusCode: 201,
    body: option
  };
}

/**
 * Update an existing option
 */
async function updateOption(optionId, data) {
  // Check if option exists
  const existingOption = await db.queryOne(
    'SELECT option_id FROM option WHERE option_id = $1',
    [optionId]
  );
  
  if (!existingOption) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Option not found',
          details: [{ field: 'option_id', value: optionId }]
        }
      }
    };
  }
  
  // Validate update data
  const errors = validateOptionData(data, true);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid option data',
          details: errors
        }
      }
    };
  }
  
  // Build UPDATE query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  const allowedFields = ['option_type', 'window_daterange', 'terms', 'exercised', 'exercised_date'];
  
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${paramCount}`);
      // Uppercase option_type value
      const value = field === 'option_type' ? data[field].toUpperCase() : data[field];
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
  
  // Add option_id for WHERE clause
  values.push(optionId);
  
  const query = `
    UPDATE option
    SET ${updates.join(', ')}
    WHERE option_id = $${paramCount}
    RETURNING 
      option_id,
      lease_version_id,
      option_type,
      window_daterange,
      terms,
      exercised,
      exercised_date,
      created_at,
      updated_at
  `;
  
  const option = await db.queryOne(query, values);
  
  return {
    statusCode: 200,
    body: option
  };
}

/**
 * Mark an option as exercised
 */
async function exerciseOption(optionId, data) {
  // Check if option exists
  const existingOption = await db.queryOne(
    'SELECT option_id, exercised FROM option WHERE option_id = $1',
    [optionId]
  );
  
  if (!existingOption) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Option not found',
          details: [{ field: 'option_id', value: optionId }]
        }
      }
    };
  }
  
  // Check if already exercised
  if (existingOption.exercised) {
    return {
      statusCode: 409,
      body: {
        error: {
          code: 'CONFLICT',
          message: 'Option has already been exercised',
          details: [{ field: 'option_id', value: optionId }]
        }
      }
    };
  }
  
  // Validate exercised_date if provided
  let exercisedDate = data.exercised_date || null;
  if (exercisedDate) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(exercisedDate)) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid exercised date format',
            details: [{
              field: 'exercised_date',
              message: 'Exercised date must be in YYYY-MM-DD format'
            }]
          }
        }
      };
    }
  }
  
  const query = `
    UPDATE option
    SET 
      exercised = TRUE,
      exercised_date = COALESCE($1, CURRENT_DATE),
      updated_at = CURRENT_TIMESTAMP
    WHERE option_id = $2
    RETURNING 
      option_id,
      lease_version_id,
      option_type,
      window_daterange,
      terms,
      exercised,
      exercised_date,
      created_at,
      updated_at
  `;
  
  const option = await db.queryOne(query, [exercisedDate, optionId]);
  
  return {
    statusCode: 200,
    body: option
  };
}

/**
 * Delete an option
 */
async function deleteOption(optionId) {
  // Check if option exists
  const existingOption = await db.queryOne(
    'SELECT option_id FROM option WHERE option_id = $1',
    [optionId]
  );
  
  if (!existingOption) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Option not found',
          details: [{ field: 'option_id', value: optionId }]
        }
      }
    };
  }
  
  const query = 'DELETE FROM option WHERE option_id = $1';
  
  await db.query(query, [optionId]);
  
  return {
    statusCode: 204,
    body: null
  };
}

/**
 * Validate option data
 */
function validateOptionData(data, isUpdate = false) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate) {
    if (!data.lease_version_id) {
      errors.push({
        field: 'lease_version_id',
        message: 'Lease version ID is required'
      });
    }
    
    if (!data.option_type) {
      errors.push({
        field: 'option_type',
        message: 'Option type is required'
      });
    }
    
    if (!data.window_daterange) {
      errors.push({
        field: 'window_daterange',
        message: 'Window date range is required'
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
  
  // Validate option_type enum
  if (data.option_type !== undefined) {
    if (typeof data.option_type !== 'string') {
      errors.push({
        field: 'option_type',
        message: 'Option type must be a string'
      });
    } else if (!VALID_OPTION_TYPES.includes(data.option_type.toUpperCase())) {
      errors.push({
        field: 'option_type',
        message: `Option type must be one of: ${VALID_OPTION_TYPES.join(', ')}`,
        allowed_values: VALID_OPTION_TYPES
      });
    }
  }
  
  // Validate window_daterange format
  if (data.window_daterange !== undefined) {
    if (typeof data.window_daterange !== 'string') {
      errors.push({
        field: 'window_daterange',
        message: 'Window date range must be a string in PostgreSQL daterange format (e.g., "[2024-01-01,2025-01-01)")'
      });
    } else {
      // Basic format validation for daterange
      const daterangeRegex = /^[\[\(]\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}[\]\)]$/;
      if (!daterangeRegex.test(data.window_daterange)) {
        errors.push({
          field: 'window_daterange',
          message: 'Window date range must be in PostgreSQL daterange format (e.g., "[2024-01-01,2025-01-01)")'
        });
      }
    }
  }
  
  // Validate terms (optional)
  if (data.terms !== undefined && data.terms !== null) {
    if (typeof data.terms !== 'string') {
      errors.push({
        field: 'terms',
        message: 'Terms must be a string'
      });
    }
  }
  
  // Validate exercised (optional)
  if (data.exercised !== undefined && data.exercised !== null) {
    if (typeof data.exercised !== 'boolean') {
      errors.push({
        field: 'exercised',
        message: 'Exercised must be a boolean'
      });
    }
  }
  
  // Validate exercised_date (optional)
  if (data.exercised_date !== undefined && data.exercised_date !== null) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(data.exercised_date)) {
      errors.push({
        field: 'exercised_date',
        message: 'Exercised date must be in YYYY-MM-DD format'
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
