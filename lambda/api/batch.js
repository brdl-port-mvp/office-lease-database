/**
 * Batch Operations API Lambda Function
 * Handles bulk create/update operations for properties, parties, and leases
 */

const db = require('./db');

// Valid party types as per schema
const VALID_PARTY_TYPES = ['TENANT', 'LANDLORD', 'SUBLANDLORD', 'GUARANTOR'];
const VALID_ESCALATION_METHODS = ['CPI', 'FIXED', 'BASE_YEAR', 'NNN', 'OTHER'];

// Maximum batch size
const MAX_BATCH_SIZE = 100;

/**
 * Lambda handler for batch endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    // Batch operations require write access
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, path, body } = event;
    
    if (httpMethod !== 'POST') {
      return createResponse(405, { 
        error: { 
          code: 'METHOD_NOT_ALLOWED', 
          message: `Method ${httpMethod} not allowed` 
        } 
      }, correlationId);
    }
    
    let result;
    
    if (path.includes('/batch/properties')) {
      result = await batchProperties(JSON.parse(body || '{}'));
    } else if (path.includes('/batch/parties')) {
      result = await batchParties(JSON.parse(body || '{}'));
    } else if (path.includes('/batch/leases')) {
      result = await batchLeases(JSON.parse(body || '{}'));
    } else {
      return createResponse(404, { 
        error: { 
          code: 'NOT_FOUND', 
          message: 'Endpoint not found' 
        } 
      }, correlationId);
    }
    
    const duration = Date.now() - startTime;
    db.logger.logResponse(result.statusCode, correlationId, duration);
    
    return createResponse(result.statusCode, result.body, correlationId);
    
  } catch (error) {
    db.logger.error('Batch API error', error);
    
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
 * Batch create/update properties
 */
async function batchProperties(data) {
  const { records } = data;
  
  // Validate batch size
  if (!Array.isArray(records)) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must contain a "records" array',
          details: []
        }
      }
    };
  }
  
  if (records.length === 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Records array cannot be empty',
          details: []
        }
      }
    };
  }
  
  if (records.length > MAX_BATCH_SIZE) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} records`,
          details: [{ provided: records.length, maximum: MAX_BATCH_SIZE }]
        }
      }
    };
  }
  
  // Process batch in transaction
  try {
    const results = await db.withTransaction(async (client) => {
      const batchResults = [];
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const recordIndex = i;
        
        try {
          // Validate record
          const errors = validatePropertyData(record);
          if (errors.length > 0) {
            batchResults.push({
              index: recordIndex,
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid property data',
                details: errors
              }
            });
            throw new Error('Validation failed');
          }
          
          // Determine if create or update
          let result;
          if (record.property_id) {
            // Update existing property
            result = await updatePropertyInTransaction(client, record.property_id, record);
          } else {
            // Create new property
            result = await createPropertyInTransaction(client, record);
          }
          
          batchResults.push({
            index: recordIndex,
            success: true,
            data: result
          });
        } catch (error) {
          batchResults.push({
            index: recordIndex,
            success: false,
            error: {
              code: error.code || 'ERROR',
              message: error.message,
              details: error.details || []
            }
          });
          throw error; // Rollback transaction
        }
      }
      
      return batchResults;
    });
    
    return {
      statusCode: 200,
      body: {
        total: records.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      }
    };
  } catch (error) {
    // Transaction rolled back, return error for all records
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'BATCH_FAILED',
          message: 'Batch operation failed and was rolled back',
          details: [{
            message: error.message
          }]
        }
      }
    };
  }
}

/**
 * Batch create/update parties
 */
async function batchParties(data) {
  const { records } = data;
  
  // Validate batch size
  if (!Array.isArray(records)) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must contain a "records" array',
          details: []
        }
      }
    };
  }
  
  if (records.length === 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Records array cannot be empty',
          details: []
        }
      }
    };
  }
  
  if (records.length > MAX_BATCH_SIZE) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} records`,
          details: [{ provided: records.length, maximum: MAX_BATCH_SIZE }]
        }
      }
    };
  }
  
  // Process batch in transaction
  try {
    const results = await db.withTransaction(async (client) => {
      const batchResults = [];
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const recordIndex = i;
        
        try {
          // Validate record
          const errors = validatePartyData(record);
          if (errors.length > 0) {
            batchResults.push({
              index: recordIndex,
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid party data',
                details: errors
              }
            });
            throw new Error('Validation failed');
          }
          
          // Determine if create or update
          let result;
          if (record.party_id) {
            // Update existing party
            result = await updatePartyInTransaction(client, record.party_id, record);
          } else {
            // Create new party
            result = await createPartyInTransaction(client, record);
          }
          
          batchResults.push({
            index: recordIndex,
            success: true,
            data: result
          });
        } catch (error) {
          batchResults.push({
            index: recordIndex,
            success: false,
            error: {
              code: error.code || 'ERROR',
              message: error.message,
              details: error.details || []
            }
          });
          throw error; // Rollback transaction
        }
      }
      
      return batchResults;
    });
    
    return {
      statusCode: 200,
      body: {
        total: records.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      }
    };
  } catch (error) {
    // Transaction rolled back, return error for all records
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'BATCH_FAILED',
          message: 'Batch operation failed and was rolled back',
          details: [{
            message: error.message
          }]
        }
      }
    };
  }
}

/**
 * Batch create/update leases with initial versions
 */
async function batchLeases(data) {
  const { records } = data;
  
  // Validate batch size
  if (!Array.isArray(records)) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must contain a "records" array',
          details: []
        }
      }
    };
  }
  
  if (records.length === 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Records array cannot be empty',
          details: []
        }
      }
    };
  }
  
  if (records.length > MAX_BATCH_SIZE) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} records`,
          details: [{ provided: records.length, maximum: MAX_BATCH_SIZE }]
        }
      }
    };
  }
  
  // Process batch in transaction
  try {
    const results = await db.withTransaction(async (client) => {
      const batchResults = [];
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const recordIndex = i;
        
        try {
          // Validate lease data
          const leaseErrors = validateLeaseData(record);
          if (leaseErrors.length > 0) {
            batchResults.push({
              index: recordIndex,
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid lease data',
                details: leaseErrors
              }
            });
            throw new Error('Validation failed');
          }
          
          // Validate initial version data if provided
          if (record.initial_version) {
            const versionErrors = validateLeaseVersionData(record.initial_version);
            if (versionErrors.length > 0) {
              batchResults.push({
                index: recordIndex,
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid lease version data',
                  details: versionErrors
                }
              });
              throw new Error('Validation failed');
            }
          }
          
          // Validate foreign key references
          const refErrors = await validateLeaseReferencesInTransaction(client, record);
          if (refErrors.length > 0) {
            batchResults.push({
              index: recordIndex,
              success: false,
              error: {
                code: 'INVALID_REFERENCE',
                message: 'Referenced resources do not exist',
                details: refErrors
              }
            });
            throw new Error('Reference validation failed');
          }
          
          // Determine if create or update
          let result;
          if (record.lease_id) {
            // Update existing lease
            result = await updateLeaseInTransaction(client, record.lease_id, record);
          } else {
            // Create new lease with initial version
            result = await createLeaseWithVersionInTransaction(client, record);
          }
          
          batchResults.push({
            index: recordIndex,
            success: true,
            data: result
          });
        } catch (error) {
          batchResults.push({
            index: recordIndex,
            success: false,
            error: {
              code: error.code || 'ERROR',
              message: error.message,
              details: error.details || []
            }
          });
          throw error; // Rollback transaction
        }
      }
      
      return batchResults;
    });
    
    return {
      statusCode: 200,
      body: {
        total: records.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      }
    };
  } catch (error) {
    // Transaction rolled back, return error for all records
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'BATCH_FAILED',
          message: 'Batch operation failed and was rolled back',
          details: [{
            message: error.message
          }]
        }
      }
    };
  }
}

/**
 * Create property within transaction
 */
async function createPropertyInTransaction(client, data) {
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
  
  const result = await client.query(query, values);
  return result.rows[0];
}

/**
 * Update property within transaction
 */
async function updatePropertyInTransaction(client, propertyId, data) {
  // Check if property exists
  const existingProperty = await client.query(
    'SELECT property_id FROM property WHERE property_id = $1',
    [propertyId]
  );
  
  if (existingProperty.rows.length === 0) {
    throw {
      code: 'NOT_FOUND',
      message: 'Property not found',
      details: [{ field: 'property_id', value: propertyId }]
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
    throw {
      code: 'VALIDATION_ERROR',
      message: 'No valid fields to update',
      details: []
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
  
  const result = await client.query(query, values);
  return result.rows[0];
}

/**
 * Create party within transaction
 */
async function createPartyInTransaction(client, data) {
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
  
  const result = await client.query(query, values);
  return result.rows[0];
}

/**
 * Update party within transaction
 */
async function updatePartyInTransaction(client, partyId, data) {
  // Check if party exists
  const existingParty = await client.query(
    'SELECT party_id FROM party WHERE party_id = $1',
    [partyId]
  );
  
  if (existingParty.rows.length === 0) {
    throw {
      code: 'NOT_FOUND',
      message: 'Party not found',
      details: [{ field: 'party_id', value: partyId }]
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
    throw {
      code: 'VALIDATION_ERROR',
      message: 'No valid fields to update',
      details: []
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
  
  const result = await client.query(query, values);
  return result.rows[0];
}

/**
 * Create lease with initial version within transaction
 */
async function createLeaseWithVersionInTransaction(client, data) {
  // Create lease
  const leaseQuery = `
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
  
  const leaseValues = [
    data.property_id,
    data.landlord_id,
    data.tenant_id,
    data.master_lease_num,
    data.execution_date || null
  ];
  
  const leaseResult = await client.query(leaseQuery, leaseValues);
  const lease = leaseResult.rows[0];
  
  // Create initial version if provided
  let version = null;
  if (data.initial_version) {
    const versionData = data.initial_version;
    
    const versionQuery = `
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
      ) VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
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
    
    const versionValues = [
      lease.lease_id,
      versionData.effective_daterange,
      versionData.suite_id || null,
      versionData.premises_rsf || null,
      versionData.term_months || null,
      versionData.base_year || null,
      versionData.escalation_method || null,
      versionData.currency_code || 'USD',
      versionData.notes || null
    ];
    
    const versionResult = await client.query(versionQuery, versionValues);
    version = versionResult.rows[0];
  }
  
  return {
    lease,
    initial_version: version
  };
}

/**
 * Update lease within transaction
 */
async function updateLeaseInTransaction(client, leaseId, data) {
  // Check if lease exists
  const existingLease = await client.query(
    'SELECT lease_id FROM lease WHERE lease_id = $1',
    [leaseId]
  );
  
  if (existingLease.rows.length === 0) {
    throw {
      code: 'NOT_FOUND',
      message: 'Lease not found',
      details: [{ field: 'lease_id', value: leaseId }]
    };
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
    throw {
      code: 'VALIDATION_ERROR',
      message: 'No valid fields to update',
      details: []
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
  
  const result = await client.query(query, values);
  return { lease: result.rows[0] };
}

/**
 * Validate property data
 */
function validatePropertyData(data) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!data.property_id && !data.name) {
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
  
  if (data.state !== undefined && data.state !== null && typeof data.state !== 'string') {
    errors.push({
      field: 'state',
      message: 'State must be a string'
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
 * Validate party data
 */
function validatePartyData(data) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!data.party_id) {
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
 * Validate lease data
 */
function validateLeaseData(data) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!data.lease_id) {
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
  
  if (data.execution_date !== undefined && data.execution_date !== null) {
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
function validateLeaseVersionData(data) {
  const errors = [];
  
  // Required field validation
  if (!data.effective_daterange) {
    errors.push({
      field: 'effective_daterange',
      message: 'Effective date range is required'
    });
  }
  
  // Validate effective_daterange format
  if (data.effective_daterange !== undefined) {
    if (typeof data.effective_daterange !== 'string') {
      errors.push({
        field: 'effective_daterange',
        message: 'Effective date range must be a string in PostgreSQL daterange format'
      });
    } else {
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
 * Validate that referenced entities exist within transaction
 */
async function validateLeaseReferencesInTransaction(client, data) {
  const errors = [];
  
  // Validate property exists
  if (data.property_id) {
    const property = await client.query(
      'SELECT property_id FROM property WHERE property_id = $1',
      [data.property_id]
    );
    if (property.rows.length === 0) {
      errors.push({
        field: 'property_id',
        message: 'Property not found',
        value: data.property_id
      });
    }
  }
  
  // Validate landlord exists and is of type LANDLORD
  if (data.landlord_id) {
    const landlord = await client.query(
      'SELECT party_id, party_type FROM party WHERE party_id = $1',
      [data.landlord_id]
    );
    if (landlord.rows.length === 0) {
      errors.push({
        field: 'landlord_id',
        message: 'Landlord not found',
        value: data.landlord_id
      });
    } else if (landlord.rows[0].party_type !== 'LANDLORD' && landlord.rows[0].party_type !== 'SUBLANDLORD') {
      errors.push({
        field: 'landlord_id',
        message: 'Party must be of type LANDLORD or SUBLANDLORD',
        value: data.landlord_id,
        actual_type: landlord.rows[0].party_type
      });
    }
  }
  
  // Validate tenant exists and is of type TENANT
  if (data.tenant_id) {
    const tenant = await client.query(
      'SELECT party_id, party_type FROM party WHERE party_id = $1',
      [data.tenant_id]
    );
    if (tenant.rows.length === 0) {
      errors.push({
        field: 'tenant_id',
        message: 'Tenant not found',
        value: data.tenant_id
      });
    } else if (tenant.rows[0].party_type !== 'TENANT') {
      errors.push({
        field: 'tenant_id',
        message: 'Party must be of type TENANT',
        value: data.tenant_id,
        actual_type: tenant.rows[0].party_type
      });
    }
  }
  
  // Validate suite_id if provided in initial_version
  if (data.initial_version && data.initial_version.suite_id) {
    const suite = await client.query(
      'SELECT suite_id FROM suite WHERE suite_id = $1',
      [data.initial_version.suite_id]
    );
    if (suite.rows.length === 0) {
      errors.push({
        field: 'initial_version.suite_id',
        message: 'Suite not found',
        value: data.initial_version.suite_id
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
