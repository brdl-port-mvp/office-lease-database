/**
 * Rent Schedule API Lambda Function
 * Handles CRUD operations for rent schedules
 */

const db = require('./db');

// Valid basis values as per schema
const VALID_BASIS_VALUES = ['MONTH', 'YEAR'];

/**
 * Lambda handler for rent schedule endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const rentId = pathParameters?.id;
    
    let result;
    
    switch (httpMethod) {
      case 'GET':
        if (rentId) {
          result = await getRentSchedule(rentId);
        } else {
          result = await listRentSchedules(queryStringParameters || {});
        }
        break;
        
      case 'POST':
        result = await createRentSchedule(JSON.parse(body || '{}'));
        break;
        
      case 'PUT':
        if (!rentId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Rent schedule ID is required' 
            } 
          }, correlationId);
        }
        result = await updateRentSchedule(rentId, JSON.parse(body || '{}'));
        break;
        
      case 'DELETE':
        if (!rentId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Rent schedule ID is required' 
            } 
          }, correlationId);
        }
        result = await deleteRentSchedule(rentId);
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
    db.logger.error('Rent Schedule API error', error);
    
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
 * Get a single rent schedule by ID
 */
async function getRentSchedule(rentId) {
  const query = `
    SELECT 
      rs.rent_id,
      rs.lease_version_id,
      rs.period_daterange,
      rs.amount,
      rs.basis,
      rs.created_at,
      rs.updated_at,
      CASE 
        WHEN rs.basis = 'YEAR' THEN rs.amount / 12
        ELSE rs.amount
      END as monthly_equiv,
      CASE 
        WHEN rs.basis = 'MONTH' THEN rs.amount * 12
        ELSE rs.amount
      END as annualized_equiv
    FROM rent_schedule rs
    WHERE rs.rent_id = $1
  `;
  
  const rentSchedule = await db.queryOne(query, [rentId]);
  
  if (!rentSchedule) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Rent schedule not found',
          details: [{ field: 'rent_id', value: rentId }]
        }
      }
    };
  }
  
  return {
    statusCode: 200,
    body: rentSchedule
  };
}

/**
 * List rent schedules with filtering by lease_version_id
 */
async function listRentSchedules(params) {
  const {
    lease_version_id,
    sort_by = 'rent_id',
    sort_order = 'ASC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['rent_id', 'period_daterange', 'amount', 'created_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'rent_id';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (lease_version_id) {
    conditions.push(`rs.lease_version_id = $${paramCount}`);
    values.push(parseInt(lease_version_id, 10));
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM rent_schedule rs
    ${whereClause}
  `;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      rs.rent_id,
      rs.lease_version_id,
      rs.period_daterange,
      rs.amount,
      rs.basis,
      rs.created_at,
      rs.updated_at,
      CASE 
        WHEN rs.basis = 'YEAR' THEN rs.amount / 12
        ELSE rs.amount
      END as monthly_equiv,
      CASE 
        WHEN rs.basis = 'MONTH' THEN rs.amount * 12
        ELSE rs.amount
      END as annualized_equiv
    FROM rent_schedule rs
    ${whereClause}
    ORDER BY rs.${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const rentSchedules = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: rentSchedules,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: rentSchedules.length
      }
    }
  };
}

/**
 * Create a new rent schedule with overlap validation
 */
async function createRentSchedule(data) {
  // Validate required fields
  const errors = validateRentScheduleData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid rent schedule data',
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
  
  // Check for overlapping date ranges
  const overlapQuery = `
    SELECT rent_id, period_daterange
    FROM rent_schedule
    WHERE lease_version_id = $1
      AND period_daterange && $2::daterange
  `;
  
  const overlap = await db.queryOne(overlapQuery, [data.lease_version_id, data.period_daterange]);
  
  if (overlap) {
    return {
      statusCode: 409,
      body: {
        error: {
          code: 'CONFLICT',
          message: 'Period date range overlaps with existing rent schedule',
          details: [{
            field: 'period_daterange',
            value: data.period_daterange,
            conflicting_rent_id: overlap.rent_id,
            conflicting_period: overlap.period_daterange
          }]
        }
      }
    };
  }
  
  const query = `
    INSERT INTO rent_schedule (
      lease_version_id,
      period_daterange,
      amount,
      basis
    ) VALUES ($1, $2, $3, $4)
    RETURNING 
      rent_id,
      lease_version_id,
      period_daterange,
      amount,
      basis,
      created_at,
      updated_at
  `;
  
  const values = [
    data.lease_version_id,
    data.period_daterange,
    data.amount,
    data.basis.toUpperCase()
  ];
  
  try {
    const rentSchedule = await db.queryOne(query, values);
    
    return {
      statusCode: 201,
      body: rentSchedule
    };
  } catch (error) {
    // Handle exclusion constraint violation (overlapping ranges)
    if (error.code === '23P01') {
      return {
        statusCode: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'Period date range overlaps with existing rent schedule',
            details: [{
              field: 'period_daterange',
              value: data.period_daterange,
              detail: 'No overlapping period_daterange allowed per lease_version'
            }]
          }
        }
      };
    }
    throw error;
  }
}

/**
 * Update an existing rent schedule
 */
async function updateRentSchedule(rentId, data) {
  // Check if rent schedule exists
  const existingRent = await db.queryOne(
    'SELECT rent_id, lease_version_id FROM rent_schedule WHERE rent_id = $1',
    [rentId]
  );
  
  if (!existingRent) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Rent schedule not found',
          details: [{ field: 'rent_id', value: rentId }]
        }
      }
    };
  }
  
  // Validate update data
  const errors = validateRentScheduleData(data, true);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid rent schedule data',
          details: errors
        }
      }
    };
  }
  
  // If updating period_daterange, check for overlaps (excluding current record)
  if (data.period_daterange) {
    const overlapQuery = `
      SELECT rent_id, period_daterange
      FROM rent_schedule
      WHERE lease_version_id = $1
        AND rent_id != $2
        AND period_daterange && $3::daterange
    `;
    
    const overlap = await db.queryOne(
      overlapQuery, 
      [existingRent.lease_version_id, rentId, data.period_daterange]
    );
    
    if (overlap) {
      return {
        statusCode: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'Period date range overlaps with existing rent schedule',
            details: [{
              field: 'period_daterange',
              value: data.period_daterange,
              conflicting_rent_id: overlap.rent_id,
              conflicting_period: overlap.period_daterange
            }]
          }
        }
      };
    }
  }
  
  // Build UPDATE query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  const allowedFields = ['period_daterange', 'amount', 'basis'];
  
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${paramCount}`);
      // Uppercase basis value
      const value = field === 'basis' ? data[field].toUpperCase() : data[field];
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
  
  // Add rent_id for WHERE clause
  values.push(rentId);
  
  const query = `
    UPDATE rent_schedule
    SET ${updates.join(', ')}
    WHERE rent_id = $${paramCount}
    RETURNING 
      rent_id,
      lease_version_id,
      period_daterange,
      amount,
      basis,
      created_at,
      updated_at
  `;
  
  try {
    const rentSchedule = await db.queryOne(query, values);
    
    return {
      statusCode: 200,
      body: rentSchedule
    };
  } catch (error) {
    // Handle exclusion constraint violation (overlapping ranges)
    if (error.code === '23P01') {
      return {
        statusCode: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'Period date range overlaps with existing rent schedule',
            details: [{
              field: 'period_daterange',
              value: data.period_daterange,
              detail: 'No overlapping period_daterange allowed per lease_version'
            }]
          }
        }
      };
    }
    throw error;
  }
}

/**
 * Delete a rent schedule
 */
async function deleteRentSchedule(rentId) {
  // Check if rent schedule exists
  const existingRent = await db.queryOne(
    'SELECT rent_id FROM rent_schedule WHERE rent_id = $1',
    [rentId]
  );
  
  if (!existingRent) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Rent schedule not found',
          details: [{ field: 'rent_id', value: rentId }]
        }
      }
    };
  }
  
  const query = 'DELETE FROM rent_schedule WHERE rent_id = $1';
  
  await db.query(query, [rentId]);
  
  return {
    statusCode: 204,
    body: null
  };
}

/**
 * Validate rent schedule data
 */
function validateRentScheduleData(data, isUpdate = false) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate) {
    if (!data.lease_version_id) {
      errors.push({
        field: 'lease_version_id',
        message: 'Lease version ID is required'
      });
    }
    
    if (!data.period_daterange) {
      errors.push({
        field: 'period_daterange',
        message: 'Period date range is required'
      });
    }
    
    if (data.amount === undefined || data.amount === null) {
      errors.push({
        field: 'amount',
        message: 'Amount is required'
      });
    }
    
    if (!data.basis) {
      errors.push({
        field: 'basis',
        message: 'Basis is required'
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
  
  // Validate period_daterange format
  if (data.period_daterange !== undefined) {
    if (typeof data.period_daterange !== 'string') {
      errors.push({
        field: 'period_daterange',
        message: 'Period date range must be a string in PostgreSQL daterange format (e.g., "[2024-01-01,2025-01-01)")'
      });
    } else {
      // Basic format validation for daterange
      const daterangeRegex = /^[\[\(]\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}[\]\)]$/;
      if (!daterangeRegex.test(data.period_daterange)) {
        errors.push({
          field: 'period_daterange',
          message: 'Period date range must be in PostgreSQL daterange format (e.g., "[2024-01-01,2025-01-01)")'
        });
      }
    }
  }
  
  // Validate amount
  if (data.amount !== undefined && data.amount !== null) {
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount < 0) {
      errors.push({
        field: 'amount',
        message: 'Amount must be a non-negative number'
      });
    }
  }
  
  // Validate basis enum
  if (data.basis !== undefined) {
    if (typeof data.basis !== 'string') {
      errors.push({
        field: 'basis',
        message: 'Basis must be a string'
      });
    } else if (!VALID_BASIS_VALUES.includes(data.basis.toUpperCase())) {
      errors.push({
        field: 'basis',
        message: `Basis must be one of: ${VALID_BASIS_VALUES.join(', ')}`,
        allowed_values: VALID_BASIS_VALUES
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
