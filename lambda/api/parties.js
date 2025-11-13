/**
 * Party API Lambda Function
 * Handles CRUD operations for parties
 */

const db = require('./db');

// Valid party types as per schema
const VALID_PARTY_TYPES = ['TENANT', 'LANDLORD', 'SUBLANDLORD', 'GUARANTOR'];

/**
 * Lambda handler for party endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const partyId = pathParameters?.id || pathParameters?.partyId;
    
    let result;
    
    switch (httpMethod) {
      case 'GET':
        if (partyId) {
          result = await getParty(partyId);
        } else {
          result = await listParties(queryStringParameters || {});
        }
        break;
        
      case 'POST':
        result = await createParty(JSON.parse(body || '{}'));
        break;
        
      case 'PUT':
        if (!partyId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Party ID is required' 
            } 
          }, correlationId);
        }
        result = await updateParty(partyId, JSON.parse(body || '{}'));
        break;
        
      case 'DELETE':
        if (!partyId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Party ID is required' 
            } 
          }, correlationId);
        }
        result = await deleteParty(partyId);
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
    db.logger.error('Party API error', error);
    
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
 * Get a single party by ID
 */
async function getParty(partyId) {
  const query = `
    SELECT 
      party_id,
      legal_name,
      party_type,
      active,
      created_at,
      updated_at
    FROM party
    WHERE party_id = $1
  `;
  
  const party = await db.queryOne(query, [partyId]);
  
  if (!party) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Party not found',
          details: [{ field: 'party_id', value: partyId }]
        }
      }
    };
  }
  
  return {
    statusCode: 200,
    body: party
  };
}

/**
 * List parties with filtering by party_type
 */
async function listParties(params) {
  const {
    party_type,
    legal_name,
    active,
    sort_by = 'party_id',
    sort_order = 'ASC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['party_id', 'legal_name', 'party_type', 'created_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'party_id';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (party_type) {
    // Validate party_type
    if (!VALID_PARTY_TYPES.includes(party_type.toUpperCase())) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid party_type',
            details: [{
              field: 'party_type',
              message: `Party type must be one of: ${VALID_PARTY_TYPES.join(', ')}`,
              value: party_type
            }]
          }
        }
      };
    }
    conditions.push(`party_type = $${paramCount}`);
    values.push(party_type.toUpperCase());
    paramCount++;
  }
  
  if (legal_name) {
    conditions.push(`legal_name ILIKE $${paramCount}`);
    values.push(`%${legal_name}%`);
    paramCount++;
  }
  
  if (active !== undefined) {
    conditions.push(`active = $${paramCount}`);
    values.push(active === 'true' || active === true);
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM party ${whereClause}`;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      party_id,
      legal_name,
      party_type,
      active,
      created_at,
      updated_at
    FROM party
    ${whereClause}
    ORDER BY ${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const parties = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: parties,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: parties.length
      }
    }
  };
}

/**
 * Create a new party
 */
async function createParty(data) {
  // Validate required fields
  const errors = validatePartyData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid party data',
          details: errors
        }
      }
    };
  }
  
  const query = `
    INSERT INTO party (
      legal_name,
      party_type,
      active
    ) VALUES ($1, $2, $3)
    RETURNING 
      party_id,
      legal_name,
      party_type,
      active,
      created_at,
      updated_at
  `;
  
  const values = [
    data.legal_name,
    data.party_type.toUpperCase(),
    data.active !== undefined ? data.active : true
  ];
  
  const party = await db.queryOne(query, values);
  
  return {
    statusCode: 201,
    body: party
  };
}

/**
 * Update an existing party
 */
async function updateParty(partyId, data) {
  // Check if party exists
  const existingParty = await db.queryOne(
    'SELECT party_id FROM party WHERE party_id = $1',
    [partyId]
  );
  
  if (!existingParty) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Party not found',
          details: [{ field: 'party_id', value: partyId }]
        }
      }
    };
  }
  
  // Validate update data
  const errors = validatePartyData(data, true);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid party data',
          details: errors
        }
      }
    };
  }
  
  // Build UPDATE query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  if (data.legal_name !== undefined) {
    updates.push(`legal_name = $${paramCount}`);
    values.push(data.legal_name);
    paramCount++;
  }
  
  if (data.party_type !== undefined) {
    updates.push(`party_type = $${paramCount}`);
    values.push(data.party_type.toUpperCase());
    paramCount++;
  }
  
  if (data.active !== undefined) {
    updates.push(`active = $${paramCount}`);
    values.push(data.active);
    paramCount++;
  }
  
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
  
  // Add party_id for WHERE clause
  values.push(partyId);
  
  const query = `
    UPDATE party
    SET ${updates.join(', ')}
    WHERE party_id = $${paramCount}
    RETURNING 
      party_id,
      legal_name,
      party_type,
      active,
      created_at,
      updated_at
  `;
  
  const party = await db.queryOne(query, values);
  
  return {
    statusCode: 200,
    body: party
  };
}

/**
 * Delete a party (soft delete via active flag)
 */
async function deleteParty(partyId) {
  // Check if party exists
  const existingParty = await db.queryOne(
    'SELECT party_id, active FROM party WHERE party_id = $1',
    [partyId]
  );
  
  if (!existingParty) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Party not found',
          details: [{ field: 'party_id', value: partyId }]
        }
      }
    };
  }
  
  // Soft delete by setting active = false
  const query = `
    UPDATE party
    SET active = false, updated_at = CURRENT_TIMESTAMP
    WHERE party_id = $1
    RETURNING 
      party_id,
      legal_name,
      party_type,
      active,
      created_at,
      updated_at
  `;
  
  const party = await db.queryOne(query, [partyId]);
  
  return {
    statusCode: 200,
    body: {
      message: 'Party deleted successfully',
      party
    }
  };
}

/**
 * Validate party data
 */
function validatePartyData(data, isUpdate = false) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate) {
    if (!data.legal_name) {
      errors.push({
        field: 'legal_name',
        message: 'Legal name is required'
      });
    }
    
    if (!data.party_type) {
      errors.push({
        field: 'party_type',
        message: 'Party type is required'
      });
    }
  }
  
  // Type validation
  if (data.legal_name !== undefined && typeof data.legal_name !== 'string') {
    errors.push({
      field: 'legal_name',
      message: 'Legal name must be a string'
    });
  }
  
  if (data.legal_name !== undefined && data.legal_name.length > 500) {
    errors.push({
      field: 'legal_name',
      message: 'Legal name must not exceed 500 characters'
    });
  }
  
  // Validate party_type enum
  if (data.party_type !== undefined) {
    if (typeof data.party_type !== 'string') {
      errors.push({
        field: 'party_type',
        message: 'Party type must be a string'
      });
    } else if (!VALID_PARTY_TYPES.includes(data.party_type.toUpperCase())) {
      errors.push({
        field: 'party_type',
        message: `Party type must be one of: ${VALID_PARTY_TYPES.join(', ')}`,
        allowed_values: VALID_PARTY_TYPES
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
