/**
 * Document Link API Lambda Function
 * Handles CRUD operations for lease document links (external references to documents)
 */

const db = require('./db');

/**
 * Lambda handler for document link endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const docId = pathParameters?.id;
    
    let result;
    
    switch (httpMethod) {
      case 'GET':
        if (docId) {
          result = await getDocLink(docId);
        } else {
          result = await listDocLinks(queryStringParameters || {});
        }
        break;
        
      case 'POST':
        result = await createDocLink(JSON.parse(body || '{}'));
        break;
        
      case 'PUT':
        if (!docId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Document link ID is required' 
            } 
          }, correlationId);
        }
        result = await updateDocLink(docId, JSON.parse(body || '{}'));
        break;
        
      case 'DELETE':
        if (!docId) {
          return createResponse(400, { 
            error: { 
              code: 'VALIDATION_ERROR', 
              message: 'Document link ID is required' 
            } 
          }, correlationId);
        }
        result = await deleteDocLink(docId);
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
    db.logger.error('Document Link API error', error);
    
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
 * Get a single document link by ID
 */
async function getDocLink(docId) {
  const query = `
    SELECT 
      dl.doc_id,
      dl.lease_id,
      dl.label,
      dl.external_ref,
      dl.created_at,
      dl.updated_at
    FROM doc_link dl
    WHERE dl.doc_id = $1
  `;
  
  const docLink = await db.queryOne(query, [docId]);
  
  if (!docLink) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Document link not found',
          details: [{ field: 'doc_id', value: docId }]
        }
      }
    };
  }
  
  return {
    statusCode: 200,
    body: docLink
  };
}

/**
 * List document links with filtering by lease_id
 */
async function listDocLinks(params) {
  const {
    lease_id,
    sort_by = 'created_at',
    sort_order = 'DESC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['doc_id', 'label', 'created_at', 'updated_at'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (lease_id) {
    conditions.push(`dl.lease_id = $${paramCount}`);
    values.push(parseInt(lease_id, 10));
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM doc_link dl
    ${whereClause}
  `;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      dl.doc_id,
      dl.lease_id,
      dl.label,
      dl.external_ref,
      dl.created_at,
      dl.updated_at
    FROM doc_link dl
    ${whereClause}
    ORDER BY dl.${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const docLinks = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: docLinks,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: docLinks.length
      }
    }
  };
}

/**
 * Create a new document link
 */
async function createDocLink(data) {
  // Validate required fields
  const errors = validateDocLinkData(data, false);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid document link data',
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
    INSERT INTO doc_link (
      lease_id,
      label,
      external_ref
    ) VALUES ($1, $2, $3)
    RETURNING 
      doc_id,
      lease_id,
      label,
      external_ref,
      created_at,
      updated_at
  `;
  
  const values = [
    data.lease_id,
    data.label,
    data.external_ref
  ];
  
  const docLink = await db.queryOne(query, values);
  
  return {
    statusCode: 201,
    body: docLink
  };
}

/**
 * Update an existing document link
 */
async function updateDocLink(docId, data) {
  // Check if document link exists
  const existingDocLink = await db.queryOne(
    'SELECT doc_id FROM doc_link WHERE doc_id = $1',
    [docId]
  );
  
  if (!existingDocLink) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Document link not found',
          details: [{ field: 'doc_id', value: docId }]
        }
      }
    };
  }
  
  // Validate update data
  const errors = validateDocLinkData(data, true);
  if (errors.length > 0) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid document link data',
          details: errors
        }
      }
    };
  }
  
  // Build UPDATE query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  const allowedFields = ['label', 'external_ref'];
  
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
  
  // Add doc_id for WHERE clause
  values.push(docId);
  
  const query = `
    UPDATE doc_link
    SET ${updates.join(', ')}
    WHERE doc_id = $${paramCount}
    RETURNING 
      doc_id,
      lease_id,
      label,
      external_ref,
      created_at,
      updated_at
  `;
  
  const docLink = await db.queryOne(query, values);
  
  return {
    statusCode: 200,
    body: docLink
  };
}

/**
 * Delete a document link
 */
async function deleteDocLink(docId) {
  // Check if document link exists
  const existingDocLink = await db.queryOne(
    'SELECT doc_id FROM doc_link WHERE doc_id = $1',
    [docId]
  );
  
  if (!existingDocLink) {
    return {
      statusCode: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: 'Document link not found',
          details: [{ field: 'doc_id', value: docId }]
        }
      }
    };
  }
  
  const query = 'DELETE FROM doc_link WHERE doc_id = $1';
  
  await db.query(query, [docId]);
  
  return {
    statusCode: 204,
    body: null
  };
}

/**
 * Validate document link data
 */
function validateDocLinkData(data, isUpdate = false) {
  const errors = [];
  
  // Required field validation (only for create)
  if (!isUpdate) {
    if (!data.lease_id) {
      errors.push({
        field: 'lease_id',
        message: 'Lease ID is required'
      });
    }
    
    if (!data.label) {
      errors.push({
        field: 'label',
        message: 'Label is required'
      });
    }
    
    if (!data.external_ref) {
      errors.push({
        field: 'external_ref',
        message: 'External reference is required'
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
  
  // Validate label
  if (data.label !== undefined) {
    if (typeof data.label !== 'string') {
      errors.push({
        field: 'label',
        message: 'Label must be a string'
      });
    } else if (data.label.trim().length === 0) {
      errors.push({
        field: 'label',
        message: 'Label cannot be empty'
      });
    }
  }
  
  // Validate external_ref format (URL or ECM identifier)
  if (data.external_ref !== undefined) {
    if (typeof data.external_ref !== 'string') {
      errors.push({
        field: 'external_ref',
        message: 'External reference must be a string'
      });
    } else if (data.external_ref.trim().length === 0) {
      errors.push({
        field: 'external_ref',
        message: 'External reference cannot be empty'
      });
    } else {
      // Validate format: URL or ECM identifier
      const isValidUrl = isValidUrlFormat(data.external_ref);
      const isValidEcm = isValidEcmFormat(data.external_ref);
      
      if (!isValidUrl && !isValidEcm) {
        errors.push({
          field: 'external_ref',
          message: 'External reference must be a valid URL (http:// or https://) or ECM identifier (alphanumeric with hyphens/underscores)',
          examples: ['https://example.com/doc.pdf', 'ECM-12345', 'DOC_ABC_123']
        });
      }
    }
  }
  
  return errors;
}

/**
 * Validate URL format
 */
function isValidUrlFormat(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate ECM identifier format
 * Allows alphanumeric characters, hyphens, underscores, and periods
 */
function isValidEcmFormat(str) {
  // ECM identifiers: alphanumeric with hyphens, underscores, periods
  // Examples: ECM-12345, DOC_ABC_123, doc.2024.001
  const ecmPattern = /^[A-Za-z0-9][A-Za-z0-9_\-\.]*$/;
  return ecmPattern.test(str) && str.length <= 255;
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
