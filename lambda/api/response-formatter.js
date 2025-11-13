/**
 * Standardized API Response Formatter
 * Provides consistent response structure across all API endpoints
 */

const { createErrorResponse } = require('./db/errors');
const { generateCorrelationId } = require('./db/logger');

/**
 * Create a standardized success response
 * @param {Object} data - Response data
 * @param {Object} options - Additional options
 * @param {number} options.statusCode - HTTP status code (default: 200)
 * @param {Object} options.metadata - Additional metadata
 * @param {Object} options.pagination - Pagination information
 * @returns {Object} Lambda response object
 */
function createSuccessResponse(data, options = {}) {
  const {
    statusCode = 200,
    metadata = {},
    pagination = null
  } = options;

  const requestId = metadata.request_id || generateCorrelationId();

  const response = {
    success: true,
    data,
    metadata: {
      request_id: requestId,
      timestamp: new Date().toISOString(),
      ...metadata
    }
  };

  // Add pagination if provided
  if (pagination) {
    response.pagination = {
      page: pagination.page || 1,
      page_size: pagination.page_size || 50,
      total_count: pagination.total_count || 0,
      total_pages: Math.ceil((pagination.total_count || 0) / (pagination.page_size || 50))
    };
  }

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId
    },
    body: JSON.stringify(response)
  };
}

/**
 * Create a standardized error response
 * @param {Error} error - Error object
 * @param {string} requestId - Request correlation ID
 * @returns {Object} Lambda response object
 */
function createStandardizedErrorResponse(error, requestId = null) {
  const correlationId = requestId || generateCorrelationId();
  const errorResponse = createErrorResponse(error, correlationId);

  return {
    statusCode: errorResponse.statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': correlationId
    },
    body: JSON.stringify({
      success: false,
      ...errorResponse.body,
      metadata: {
        request_id: correlationId,
        timestamp: new Date().toISOString()
      }
    })
  };
}

/**
 * Create a validation error response
 * @param {Array} validationErrors - Array of validation error objects
 * @param {string} requestId - Request correlation ID
 * @returns {Object} Lambda response object
 */
function createValidationErrorResponse(validationErrors, requestId = null) {
  const correlationId = requestId || generateCorrelationId();

  return {
    statusCode: 400,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': correlationId
    },
    body: JSON.stringify({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        details: validationErrors,
        request_id: correlationId
      },
      metadata: {
        request_id: correlationId,
        timestamp: new Date().toISOString()
      }
    })
  };
}

/**
 * Create a not found error response
 * @param {string} resource - Resource type (e.g., 'Property', 'Lease')
 * @param {string|number} id - Resource ID
 * @param {string} requestId - Request correlation ID
 * @returns {Object} Lambda response object
 */
function createNotFoundResponse(resource, id, requestId = null) {
  const correlationId = requestId || generateCorrelationId();

  return {
    statusCode: 404,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': correlationId
    },
    body: JSON.stringify({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `${resource} not found`,
        details: [{
          resource,
          id,
          message: `${resource} with ID ${id} does not exist`
        }],
        request_id: correlationId
      },
      metadata: {
        request_id: correlationId,
        timestamp: new Date().toISOString()
      }
    })
  };
}

/**
 * Create an unauthorized error response
 * @param {string} message - Error message
 * @param {string} requestId - Request correlation ID
 * @returns {Object} Lambda response object
 */
function createUnauthorizedResponse(message = 'Unauthorized', requestId = null) {
  const correlationId = requestId || generateCorrelationId();

  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': correlationId
    },
    body: JSON.stringify({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message,
        details: [],
        request_id: correlationId
      },
      metadata: {
        request_id: correlationId,
        timestamp: new Date().toISOString()
      }
    })
  };
}

/**
 * Create a forbidden error response
 * @param {string} message - Error message
 * @param {string} requestId - Request correlation ID
 * @returns {Object} Lambda response object
 */
function createForbiddenResponse(message = 'Forbidden', requestId = null) {
  const correlationId = requestId || generateCorrelationId();

  return {
    statusCode: 403,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': correlationId
    },
    body: JSON.stringify({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message,
        details: [],
        request_id: correlationId
      },
      metadata: {
        request_id: correlationId,
        timestamp: new Date().toISOString()
      }
    })
  };
}

/**
 * Validate required fields in request body
 * @param {Object} body - Request body
 * @param {Array<string>} requiredFields - Array of required field names
 * @returns {Array} Array of validation errors (empty if valid)
 */
function validateRequiredFields(body, requiredFields) {
  const errors = [];

  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      errors.push({
        field,
        message: `Field '${field}' is required`
      });
    }
  }

  return errors;
}

/**
 * Validate field types in request body
 * @param {Object} body - Request body
 * @param {Object} fieldTypes - Object mapping field names to expected types
 * @returns {Array} Array of validation errors (empty if valid)
 */
function validateFieldTypes(body, fieldTypes) {
  const errors = [];

  for (const [field, expectedType] of Object.entries(fieldTypes)) {
    if (body[field] !== undefined && body[field] !== null) {
      const actualType = typeof body[field];
      
      if (expectedType === 'array' && !Array.isArray(body[field])) {
        errors.push({
          field,
          message: `Field '${field}' must be an array`
        });
      } else if (expectedType !== 'array' && actualType !== expectedType) {
        errors.push({
          field,
          message: `Field '${field}' must be of type ${expectedType}`
        });
      }
    }
  }

  return errors;
}

/**
 * Validate enum values in request body
 * @param {Object} body - Request body
 * @param {Object} enumFields - Object mapping field names to allowed values
 * @returns {Array} Array of validation errors (empty if valid)
 */
function validateEnumValues(body, enumFields) {
  const errors = [];

  for (const [field, allowedValues] of Object.entries(enumFields)) {
    if (body[field] !== undefined && body[field] !== null) {
      if (!allowedValues.includes(body[field])) {
        errors.push({
          field,
          message: `Field '${field}' must be one of: ${allowedValues.join(', ')}`
        });
      }
    }
  }

  return errors;
}

module.exports = {
  createSuccessResponse,
  createStandardizedErrorResponse,
  createValidationErrorResponse,
  createNotFoundResponse,
  createUnauthorizedResponse,
  createForbiddenResponse,
  validateRequiredFields,
  validateFieldTypes,
  validateEnumValues
};
