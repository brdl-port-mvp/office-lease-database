/**
 * Lease API Lambda Function
 * Handles CRUD operations for leases and lease versions
 */

const db = require('./db');

// Valid escalation methods as per schema
const VALID_ESCALATION_METHODS = ['CPI', 'FIXED', 'BASE_YEAR', 'NNN', 'OTHER'];

/**
 * Lambda handler for lease endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body, path } = event;
    const leaseId = pathParameters?.id || pathParameters?.leaseId;
    
    let result;
    
    // Check if this is a lease version endpoint
    if (path && path.includes('/versions')) {
      result = await handleLeaseVersionEndpoint(httpMethod, leaseId, body);
    } else {
      // Handle lease CRUD operations
      switch (httpMethod) {
        case 'GET':
          if (leaseId) {
            result = await getLease(leaseId);
          } else {
            result = await listLeases(queryStringParameters || {});
          }
          break;
          
        case 'POST':
          result = await createLease(JSON.parse(body || '{}'));
          break;
          
        case 'PUT':
          if (!leaseId) {
            return createResponse(400, { 
              error: { 
                code: 'VALIDATION_ERROR', 
                message: 'Lease ID is required' 
              } 
            }, correlationId);
          }
          result = await updateLease(leaseId, JSON.parse(body || '{}'));
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
    db.logger.error('Lease API error', error);
    
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
 * Handle lease version endpoints
 */
async function handleLeaseVersionEndpoint(httpMethod, leaseId, body) {
  if (httpMethod === 'POST') {
    if (!leaseId) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Lease ID is required'
          }
        }
      };
    }
    return await createLeaseVersion(leaseId, JSON.parse(body || '{}'));
  }
  
  return {
    statusCode: 405,
    body: {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: `Method ${httpMethod} not allowed for lease versions`
      }
    }
  };
}

/**
 * Get a single lease by ID with current version details
 */
async function getLease(leaseId) {
  // Get lease master data
  const leaseQuery = `
    SELECT 
      l.lease_id,
      l.property_id,
      l.landlord_id,
      l.tenant_id,
      l.master_lease_num,
      l.execution_date,
      l.created_at,
      l.updated_at,
      p.name as property_name,
      landlord.legal_name as landlord_name,
      tenant.legal_name as tenant_name
    FROM lease l
    JOIN property p ON l.property_id = p.property_id
    JOIN party landlord ON l.landlord_id = landlord.party_id
    JOIN party tenant ON l.tenant_id = tenant.party_id
    WHERE l.lease_id = $1
  `;
  
  const lease = await db.queryOne(leaseQuery, [leaseId]);
  
  if (!lease) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Lease not found',
          details: [{ field: 'lease_id', value: leaseId }]
        }
      }
    };
  }
  
  // Get current version details
  const versionQuery = `
    SELECT 
      lv.lease_version_id,
      lv.version_num,
      lv.effective_daterange,
      lv.suite_id,
      lv.premises_rsf,
      lv.term_months,
      lv.base_year,
      lv.escalation_method,
      lv.currency_code,
      lv.is_current,
      lv.notes,
      lv.created_at,
      lv.updated_at,
      s.suite_code
    FROM lease_version lv
    LEFT JOIN suite s ON lv.suite_id = s.suite_id
    WHERE lv.lease_id = $1 AND lv.is_current = TRUE
  `;
  
  const currentVersion = await db.queryOne(versionQuery, [leaseId]);
  
  // Combine lease and version data
  const response = {
    ...lease,
    current_version: currentVersion
  };
  
  return {
    statusCode: 200,
    body: response
  };
}

/**
 * List leases with filtering by property, tenant, state
 */
async function listLeases(params) {
  const {
    property_id,
    tenant_id,
    state,
    master_lease_num,
    sort_by = 'lease_id',
    sort_order = 'ASC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['lease_id', 'master_lease_num', 'execution_date', 'created_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'lease_id';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (property_id) {
    conditions.push(`l.property_id = $${paramCount}`);
    values.push(parseInt(property_id, 10));
    paramCount++;
  }
  
  if (tenant_id) {
    conditions.push(`l.tenant_id = $${paramCount}`);
    values.push(parseInt(tenant_id, 10));
    paramCount++;
  }
  
  if (state) {
    conditions.push(`p.state = $${paramCount}`);
    values.push(state);
    paramCount++;
  }
  
  if (master_lease_num) {
    conditions.push(`l.master_lease_num ILIKE $${paramCount}`);
    values.push(`%${master_lease_num}%`);
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM lease l
    JOIN property p ON l.property_id = p.property_id
    ${whereClause}
  `;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      l.lease_id,
      l.property_id,
      l.landlord_id,
      l.tenant_id,
      l.master_lease_num,
      l.execution_date,
      l.created_at,
      l.updated_at,
      p.name as property_name,
      p.state as property_state,
      landlord.legal_name as landlord_name,
      tenant.legal_name as tenant_name
    FROM lease l
    JOIN property p ON l.property_id = p.property_id
    JOIN party landlord ON l.landlord_id = landlord.party_id
    JOIN party tenant ON l.tenant_id = tenant.party_id
    ${whereClause}
    ORDER BY l.${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const leases = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: leases,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: leases.length
      }
    }
  };
}

/**
 * Create a new lease with property, tenant, landlord validation
 */
async function createLease(data) {
  // Validate required fields
  const errors = validateLeaseData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid lease data',
          details: errors
        }
      }
    };
  }
  
  // Validate foreign key references exist
  const validationErrors = await validateLeaseReferences(data);
  if (validationErrors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'INVALID_REFERENCE',
          message: 'Referenced resources do not exist',
          details: validationErrors
        }
      }
    };
  }
  
  const query = `
    INSERT INTO lease (
      property_id,
      landlord_id,
      tenant_id,
      master_lease_num,
      execution_date
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING 
      lease_id,
      property_id,
      landlord_id,
      tenant_id,
      master_lease_num,
      execution_date,
      created_at,
      updated_at
  `;
  
  const values = [
    data.property_id,
    data.landlord_id,
    data.tenant_id,
    data.master_lease_num,
    data.execution_date || null
  ];
  
  try {
    const lease = await db.queryOne(query, values);
    
    return {
      statusCode: 201,
      body: lease
    };
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === '23505' && error.constraint === 'uq_lease_property_num') {
      return {
        statusCode: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'Lease with this master lease number already exists for this property',
            details: [{
              field: 'master_lease_num',
              value: data.master_lease_num,
              property_id: data.property_id
            }]
          }
        }
      };
    }
    throw error;
  }
}

/**
 * Update an existing lease (master data only)
 */
async function updateLease(leaseId, data) {
  // Check if lease exists
  const existingLease = await db.queryOne(
    'SELECT lease_id FROM lease WHERE lease_id = $1',
    [leaseId]
  );
  
  if (!existingLease) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Lease not found',
          details: [{ field: 'lease_id', value: leaseId }]
        }
      }
    };
  }
  
  // Validate update data
  const errors = validateLeaseData(data, true);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid lease data',
          details: errors
        }
      }
    };
  }
  
  // Validate foreign key references if provided
  if (data.property_id || data.landlord_id || data.tenant_id) {
    const validationErrors = await validateLeaseReferences(data);
    if (validationErrors.length > 0) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: 'INVALID_REFERENCE',
            message: 'Referenced resources do not exist',
            details: validationErrors
          }
        }
      };
    }
  }
  
  // Build UPDATE query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  const allowedFields = ['property_id', 'landlord_id', 'tenant_id', 'master_lease_num', 'execution_date'];
  
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
  
  // Add lease_id for WHERE clause
  values.push(leaseId);
  
  const query = `
    UPDATE lease
    SET ${updates.join(', ')}
    WHERE lease_id = $${paramCount}
    RETURNING 
      lease_id,
      property_id,
      landlord_id,
      tenant_id,
      master_lease_num,
      execution_date,
      created_at,
      updated_at
  `;
  
  try {
    const lease = await db.queryOne(query, values);
    
    return {
      statusCode: 200,
      body: lease
    };
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === '23505' && error.constraint === 'uq_lease_property_num') {
      return {
        statusCode: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'Lease with this master lease number already exists for this property',
            details: [{
              field: 'master_lease_num',
              value: data.master_lease_num
            }]
          }
        }
      };
    }
    throw error;
  }
}

/**
 * Create a new lease version (amendment)
 */
async function createLeaseVersion(leaseId, data) {
  // Validate required fields
  const errors = validateLeaseVersionData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid lease version data',
          details: errors
        }
      }
    };
  }
  
  // Check if lease exists
  const existingLease = await db.queryOne(
    'SELECT lease_id FROM lease WHERE lease_id = $1',
    [leaseId]
  );
  
  if (!existingLease) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Lease not found',
          details: [{ field: 'lease_id', value: leaseId }]
        }
      }
    };
  }
  
  // Validate suite_id if provided
  if (data.suite_id) {
    const suite = await db.queryOne(
      'SELECT suite_id FROM suite WHERE suite_id = $1',
      [data.suite_id]
    );
    if (!suite) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: 'INVALID_REFERENCE',
            message: 'Suite not found',
            details: [{ field: 'suite_id', value: data.suite_id }]
          }
        }
      };
    }
  }
  
  // Use transaction to ensure atomicity
  try {
    const result = await db.withTransaction(async (client) => {
      // Check for overlapping date ranges
      const overlapQuery = `
        SELECT lease_version_id, effective_daterange
        FROM lease_version
        WHERE lease_id = $1
          AND effective_daterange && $2::daterange
      `;
      const overlap = await client.query(overlapQuery, [leaseId, data.effective_daterange]);
      
      if (overlap.rows.length > 0) {
        throw {
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Effective date range overlaps with existing version',
          details: [{
            field: 'effective_daterange',
            value: data.effective_daterange,
            conflicting_version_id: overlap.rows[0].lease_version_id
          }]
        };
      }
      
      // Get the next version number
      const versionNumQuery = `
        SELECT COALESCE(MAX(version_num), -1) + 1 as next_version
        FROM lease_version
        WHERE lease_id = $1
      `;
      const versionResult = await client.query(versionNumQuery, [leaseId]);
      const nextVersion = versionResult.rows[0].next_version;
      
      // Set all existing versions to is_current = FALSE
      await client.query(
        'UPDATE lease_version SET is_current = FALSE WHERE lease_id = $1',
        [leaseId]
      );
      
      // Insert new version with is_current = TRUE
      const insertQuery = `
        INSERT INTO lease_version (
          lease_id,
          version_num,
          effective_daterange,
          suite_id,
          premises_rsf,
          term_months,
          base_year,
          escalation_method,
          currency_code,
          is_current,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
        RETURNING 
          lease_version_id,
          lease_id,
          version_num,
          effective_daterange,
          suite_id,
          premises_rsf,
          term_months,
          base_year,
          escalation_method,
          currency_code,
          is_current,
          notes,
          created_at,
          updated_at
      `;
      
      const insertValues = [
        leaseId,
        nextVersion,
        data.effective_daterange,
        data.suite_id || null,
        data.premises_rsf || null,
        data.term_months || null,
        data.base_year || null,
        data.escalation_method || null,
        data.currency_code || 'USD',
        data.notes || null
      ];
      
      const insertResult = await client.query(insertQuery, insertValues);
      return insertResult.rows[0];
    });
    
    return {
      statusCode: 201,
      body: result
    };
  } catch (error) {
    if (error.statusCode) {
      return {
        statusCode: error.statusCode,
        body: {
          error: {
            code: error.code,
            message: error.message,
            details: error.details
          }
        }
      };
    }
    throw error;
  }
}

/**
 * Validate lease data
 */
function validateLeaseData(data, isUpdate = false) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate) {
    if (!data.property_id) {
      errors.push({
        field: 'property_id',
        message: 'Property ID is required'
      });
    }
    
    if (!data.landlord_id) {
      errors.push({
        field: 'landlord_id',
        message: 'Landlord ID is required'
      });
    }
    
    if (!data.tenant_id) {
      errors.push({
        field: 'tenant_id',
        message: 'Tenant ID is required'
      });
    }
    
    if (!data.master_lease_num) {
      errors.push({
        field: 'master_lease_num',
        message: 'Master lease number is required'
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
    }
  }
  
  if (data.landlord_id !== undefined) {
    const landlordId = parseInt(data.landlord_id, 10);
    if (isNaN(landlordId) || landlordId <= 0) {
      errors.push({
        field: 'landlord_id',
        message: 'Landlord ID must be a positive integer'
      });
    }
  }
  
  if (data.tenant_id !== undefined) {
    const tenantId = parseInt(data.tenant_id, 10);
    if (isNaN(tenantId) || tenantId <= 0) {
      errors.push({
        field: 'tenant_id',
        message: 'Tenant ID must be a positive integer'
      });
    }
  }
  
  if (data.master_lease_num !== undefined && typeof data.master_lease_num !== 'string') {
    errors.push({
      field: 'master_lease_num',
      message: 'Master lease number must be a string'
    });
  }
  
  if (data.master_lease_num !== undefined && data.master_lease_num.length > 100) {
    errors.push({
      field: 'master_lease_num',
      message: 'Master lease number must not exceed 100 characters'
    });
  }
  
  if (data.execution_date !== undefined && data.execution_date !== null) {
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(data.execution_date)) {
      errors.push({
        field: 'execution_date',
        message: 'Execution date must be in YYYY-MM-DD format'
      });
    }
  }
  
  return errors;
}

/**
 * Validate lease version data
 */
function validateLeaseVersionData(data, isUpdate = false) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate) {
    if (!data.effective_daterange) {
      errors.push({
        field: 'effective_daterange',
        message: 'Effective date range is required'
      });
    }
  }
  
  // Validate effective_daterange format
  if (data.effective_daterange !== undefined) {
    if (typeof data.effective_daterange !== 'string') {
      errors.push({
        field: 'effective_daterange',
        message: 'Effective date range must be a string in PostgreSQL daterange format (e.g., "[2024-01-01,2025-01-01)")'
      });
    } else {
      // Basic format validation for daterange
      const daterangeRegex = /^[\[\(]\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}[\]\)]$/;
      if (!daterangeRegex.test(data.effective_daterange)) {
        errors.push({
          field: 'effective_daterange',
          message: 'Effective date range must be in PostgreSQL daterange format (e.g., "[2024-01-01,2025-01-01)")'
        });
      }
    }
  }
  
  // Validate suite_id
  if (data.suite_id !== undefined && data.suite_id !== null) {
    const suiteId = parseInt(data.suite_id, 10);
    if (isNaN(suiteId) || suiteId <= 0) {
      errors.push({
        field: 'suite_id',
        message: 'Suite ID must be a positive integer'
      });
    }
  }
  
  // Validate premises_rsf
  if (data.premises_rsf !== undefined && data.premises_rsf !== null) {
    const rsf = parseInt(data.premises_rsf, 10);
    if (isNaN(rsf) || rsf < 0) {
      errors.push({
        field: 'premises_rsf',
        message: 'Premises RSF must be a non-negative integer'
      });
    }
  }
  
  // Validate term_months
  if (data.term_months !== undefined && data.term_months !== null) {
    const months = parseInt(data.term_months, 10);
    if (isNaN(months) || months <= 0) {
      errors.push({
        field: 'term_months',
        message: 'Term months must be a positive integer'
      });
    }
  }
  
  // Validate base_year
  if (data.base_year !== undefined && data.base_year !== null) {
    const year = parseInt(data.base_year, 10);
    if (isNaN(year) || year < 1900 || year > 2100) {
      errors.push({
        field: 'base_year',
        message: 'Base year must be a valid year between 1900 and 2100'
      });
    }
  }
  
  // Validate escalation_method enum
  if (data.escalation_method !== undefined && data.escalation_method !== null) {
    if (typeof data.escalation_method !== 'string') {
      errors.push({
        field: 'escalation_method',
        message: 'Escalation method must be a string'
      });
    } else if (!VALID_ESCALATION_METHODS.includes(data.escalation_method.toUpperCase())) {
      errors.push({
        field: 'escalation_method',
        message: `Escalation method must be one of: ${VALID_ESCALATION_METHODS.join(', ')}`,
        allowed_values: VALID_ESCALATION_METHODS
      });
    }
  }
  
  // Validate currency_code
  if (data.currency_code !== undefined && data.currency_code !== 'USD') {
    errors.push({
      field: 'currency_code',
      message: 'Currency code must be USD (Phase 1 limitation)'
    });
  }
  
  return errors;
}

/**
 * Validate that referenced entities exist
 */
async function validateLeaseReferences(data) {
  const errors = [];
  
  // Validate property exists
  if (data.property_id) {
    const property = await db.queryOne(
      'SELECT property_id FROM property WHERE property_id = $1',
      [data.property_id]
    );
    if (!property) {
      errors.push({
        field: 'property_id',
        message: 'Property not found',
        value: data.property_id
      });
    }
  }
  
  // Validate landlord exists and is of type LANDLORD
  if (data.landlord_id) {
    const landlord = await db.queryOne(
      'SELECT party_id, party_type FROM party WHERE party_id = $1',
      [data.landlord_id]
    );
    if (!landlord) {
      errors.push({
        field: 'landlord_id',
        message: 'Landlord not found',
        value: data.landlord_id
      });
    } else if (landlord.party_type !== 'LANDLORD' && landlord.party_type !== 'SUBLANDLORD') {
      errors.push({
        field: 'landlord_id',
        message: 'Party must be of type LANDLORD or SUBLANDLORD',
        value: data.landlord_id,
        actual_type: landlord.party_type
      });
    }
  }
  
  // Validate tenant exists and is of type TENANT
  if (data.tenant_id) {
    const tenant = await db.queryOne(
      'SELECT party_id, party_type FROM party WHERE party_id = $1',
      [data.tenant_id]
    );
    if (!tenant) {
      errors.push({
        field: 'tenant_id',
        message: 'Tenant not found',
        value: data.tenant_id
      });
    } else if (tenant.party_type !== 'TENANT') {
      errors.push({
        field: 'tenant_id',
        message: 'Party must be of type TENANT',
        value: data.tenant_id,
        actual_type: tenant.party_type
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
    body: JSON.stringify(body)
  };
  
  if (correlationId) {
    response.headers['X-Correlation-ID'] = correlationId;
  }
  
  return response;
}

module.exports = {
  handler: exports.handler
};
