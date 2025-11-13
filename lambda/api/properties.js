/**
 * Property API Lambda Function
 * Handles CRUD operations for properties
 */

const db = require('./db');

/**
 * Lambda handler for property endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const propertyId = pathParameters?.id || pathParameters?.propertyId;
    
    let result;
    
    switch (httpMethod) {
      case 'GET':
        if (propertyId) {
          result = await getProperty(propertyId);
        } else {
          result = await listProperties(queryStringParameters || {});
        }
        break;
        
      case 'POST':
        result = await createProperty(JSON.parse(body || '{}'));
        break;
        
      case 'PUT':
        if (!propertyId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Property ID is required' 
            } 
          }, correlationId);
        }
        result = await updateProperty(propertyId, JSON.parse(body || '{}'));
        break;
        
      case 'DELETE':
        if (!propertyId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Property ID is required' 
            } 
          }, correlationId);
        }
        result = await deleteProperty(propertyId);
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
    db.logger.error('Property API error', error);
    
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
 * Get a single property by ID
 */
async function getProperty(propertyId) {
  const query = `
    SELECT 
      property_id,
      name,
      address,
      state,
      postal_code,
      country,
      total_rsf,
      active,
      created_at,
      updated_at
    FROM property
    WHERE property_id = $1
  `;
  
  const property = await db.queryOne(query, [propertyId]);
  
  if (!property) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Property not found',
          details: [{ field: 'property_id', value: propertyId }]
        }
      }
    };
  }
  
  return {
    statusCode: 200,
    body: property
  };
}

/**
 * List properties with filtering, sorting, and pagination
 */
async function listProperties(params) {
  const {
    name,
    state,
    country,
    active,
    sort_by = 'property_id',
    sort_order = 'ASC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['property_id', 'name', 'state', 'total_rsf', 'created_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'property_id';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (name) {
    conditions.push(`name ILIKE $${paramCount}`);
    values.push(`%${name}%`);
    paramCount++;
  }
  
  if (state) {
    conditions.push(`state = $${paramCount}`);
    values.push(state);
    paramCount++;
  }
  
  if (country) {
    conditions.push(`country = $${paramCount}`);
    values.push(country);
    paramCount++;
  }
  
  if (active !== undefined) {
    conditions.push(`active = $${paramCount}`);
    values.push(active === 'true' || active === true);
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM property ${whereClause}`;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      property_id,
      name,
      address,
      state,
      postal_code,
      country,
      total_rsf,
      active,
      created_at,
      updated_at
    FROM property
    ${whereClause}
    ORDER BY ${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const properties = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: properties,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: properties.length
      }
    }
  };
}

/**
 * Create a new property
 */
async function createProperty(data) {
  // Validate required fields
  const errors = validatePropertyData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid property data',
          details: errors
        }
      }
    };
  }
  
  const query = `
    INSERT INTO property (
      name,
      address,
      state,
      postal_code,
      country,
      total_rsf,
      active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING 
      property_id,
      name,
      address,
      state,
      postal_code,
      country,
      total_rsf,
      active,
      created_at,
      updated_at
  `;
  
  const values = [
    data.name,
    data.address || null,
    data.state || null,
    data.postal_code || null,
    data.country || 'USA',
    data.total_rsf || null,
    data.active !== undefined ? data.active : true
  ];
  
  const property = await db.queryOne(query, values);
  
  return {
    statusCode: 201,
    body: property
  };
}

/**
 * Update an existing property
 */
async function updateProperty(propertyId, data) {
  // Check if property exists
  const existingProperty = await db.queryOne(
    'SELECT property_id FROM property WHERE property_id = $1',
    [propertyId]
  );
  
  if (!existingProperty) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Property not found',
          details: [{ field: 'property_id', value: propertyId }]
        }
      }
    };
  }
  
  // Validate update data
  const errors = validatePropertyData(data, true);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid property data',
          details: errors
        }
      }
    };
  }
  
  // Build UPDATE query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  const allowedFields = ['name', 'address', 'state', 'postal_code', 'country', 'total_rsf', 'active'];
  
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
  
  // Add property_id for WHERE clause
  values.push(propertyId);
  
  const query = `
    UPDATE property
    SET ${updates.join(', ')}
    WHERE property_id = $${paramCount}
    RETURNING 
      property_id,
      name,
      address,
      state,
      postal_code,
      country,
      total_rsf,
      active,
      created_at,
      updated_at
  `;
  
  const property = await db.queryOne(query, values);
  
  return {
    statusCode: 200,
    body: property
  };
}

/**
 * Delete a property (soft delete via active flag)
 */
async function deleteProperty(propertyId) {
  // Check if property exists
  const existingProperty = await db.queryOne(
    'SELECT property_id, active FROM property WHERE property_id = $1',
    [propertyId]
  );
  
  if (!existingProperty) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Property not found',
          details: [{ field: 'property_id', value: propertyId }]
        }
      }
    };
  }
  
  // Soft delete by setting active = false
  const query = `
    UPDATE property
    SET active = false, updated_at = CURRENT_TIMESTAMP
    WHERE property_id = $1
    RETURNING 
      property_id,
      name,
      address,
      state,
      postal_code,
      country,
      total_rsf,
      active,
      created_at,
      updated_at
  `;
  
  const property = await db.queryOne(query, [propertyId]);
  
  return {
    statusCode: 200,
    body: {
      message: 'Property deleted successfully',
      property
    }
  };
}

/**
 * Validate property data
 */
function validatePropertyData(data, isUpdate = false) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate && !data.name) {
    errors.push({
      field: 'name',
      message: 'Property name is required'
    });
  }
  
  // Type validation
  if (data.name !== undefined && typeof data.name !== 'string') {
    errors.push({
      field: 'name',
      message: 'Property name must be a string'
    });
  }
  
  if (data.name !== undefined && data.name.length > 255) {
    errors.push({
      field: 'name',
      message: 'Property name must not exceed 255 characters'
    });
  }
  
  if (data.address !== undefined && data.address !== null && typeof data.address !== 'string') {
    errors.push({
      field: 'address',
      message: 'Address must be a string'
    });
  }
  
  if (data.address !== undefined && data.address !== null && data.address.length > 500) {
    errors.push({
      field: 'address',
      message: 'Address must not exceed 500 characters'
    });
  }
  
  if (data.state !== undefined && data.state !== null && typeof data.state !== 'string') {
    errors.push({
      field: 'state',
      message: 'State must be a string'
    });
  }
  
  if (data.postal_code !== undefined && data.postal_code !== null && typeof data.postal_code !== 'string') {
    errors.push({
      field: 'postal_code',
      message: 'Postal code must be a string'
    });
  }
  
  if (data.country !== undefined && data.country !== null && typeof data.country !== 'string') {
    errors.push({
      field: 'country',
      message: 'Country must be a string'
    });
  }
  
  if (data.total_rsf !== undefined && data.total_rsf !== null) {
    const rsf = parseInt(data.total_rsf, 10);
    if (isNaN(rsf) || rsf < 0) {
      errors.push({
        field: 'total_rsf',
        message: 'Total RSF must be a non-negative integer'
      });
    }
  }
  
  if (data.active !== undefined && typeof data.active !== 'boolean') {
    errors.push({
      field: 'active',
      message: 'Active must be a boolean'
    });
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
