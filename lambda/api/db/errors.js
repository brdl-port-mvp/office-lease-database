/**
 * Database Error Handling Utilities
 * Maps PostgreSQL errors to HTTP status codes and standardized responses
 */

/**
 * Database error codes mapping
 */
const ERROR_CODES = {
  // Constraint violations
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  EXCLUSION_VIOLATION: '23P01',
  
  // Connection errors
  CONNECTION_EXCEPTION: '08000',
  CONNECTION_FAILURE: '08006',
  
  // Query errors
  SYNTAX_ERROR: '42601',
  UNDEFINED_TABLE: '42P01',
  UNDEFINED_COLUMN: '42703',
  
  // Transaction errors
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01'
};

/**
 * Custom error class for database operations
 */
class DatabaseError extends Error {
  constructor(message, code, statusCode = 500, details = []) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Map PostgreSQL error to HTTP status code and error details
 * @param {Error} error - PostgreSQL error
 * @returns {Object} Mapped error information
 */
function mapDatabaseError(error) {
  const pgCode = error.code;
  const pgDetail = error.detail || '';
  const pgConstraint = error.constraint || '';
  
  // Unique constraint violation
  if (pgCode === ERROR_CODES.UNIQUE_VIOLATION) {
    return {
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Resource already exists',
      details: [{
        type: 'unique_violation',
        constraint: pgConstraint,
        detail: pgDetail
      }]
    };
  }
  
  // Foreign key violation
  if (pgCode === ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    return {
      statusCode: 400,
      code: 'INVALID_REFERENCE',
      message: 'Referenced resource does not exist',
      details: [{
        type: 'foreign_key_violation',
        constraint: pgConstraint,
        detail: pgDetail
      }]
    };
  }
  
  // Check constraint violation
  if (pgCode === ERROR_CODES.CHECK_VIOLATION) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Data validation failed',
      details: [{
        type: 'check_violation',
        constraint: pgConstraint,
        detail: pgDetail
      }]
    };
  }
  
  // Not null violation
  if (pgCode === ERROR_CODES.NOT_NULL_VIOLATION) {
    const column = error.column || 'unknown';
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Required field is missing',
      details: [{
        type: 'not_null_violation',
        field: column,
        detail: `Field '${column}' cannot be null`
      }]
    };
  }
  
  // Exclusion constraint violation (e.g., overlapping date ranges)
  if (pgCode === ERROR_CODES.EXCLUSION_VIOLATION) {
    return {
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Data conflict detected',
      details: [{
        type: 'exclusion_violation',
        constraint: pgConstraint,
        detail: pgDetail
      }]
    };
  }
  
  // Connection errors
  if (pgCode === ERROR_CODES.CONNECTION_EXCEPTION || 
      pgCode === ERROR_CODES.CONNECTION_FAILURE) {
    return {
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database connection failed',
      details: [{
        type: 'connection_error',
        detail: 'Unable to connect to database. Please retry.'
      }]
    };
  }
  
  // Syntax errors (should not happen in production)
  if (pgCode === ERROR_CODES.SYNTAX_ERROR) {
    return {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Query syntax error',
      details: [{
        type: 'syntax_error',
        detail: error.message
      }]
    };
  }
  
  // Undefined table or column
  if (pgCode === ERROR_CODES.UNDEFINED_TABLE || 
      pgCode === ERROR_CODES.UNDEFINED_COLUMN) {
    return {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Database schema error',
      details: [{
        type: 'schema_error',
        detail: error.message
      }]
    };
  }
  
  // Serialization failure (retry-able)
  if (pgCode === ERROR_CODES.SERIALIZATION_FAILURE) {
    return {
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Transaction conflict. Please retry.',
      details: [{
        type: 'serialization_failure',
        detail: 'Concurrent modification detected',
        retryable: true
      }]
    };
  }
  
  // Deadlock detected (retry-able)
  if (pgCode === ERROR_CODES.DEADLOCK_DETECTED) {
    return {
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Deadlock detected. Please retry.',
      details: [{
        type: 'deadlock',
        detail: 'Transaction deadlock occurred',
        retryable: true
      }]
    };
  }
  
  // Query timeout
  if (error.message && error.message.includes('timeout')) {
    return {
      statusCode: 504,
      code: 'TIMEOUT',
      message: 'Query execution timeout',
      details: [{
        type: 'timeout',
        detail: 'Query took too long to execute'
      }]
    };
  }
  
  // Generic database error
  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Database operation failed',
    details: [{
      type: 'database_error',
      detail: error.message,
      code: pgCode
    }]
  };
}

/**
 * Create a standardized error response
 * @param {Error} error - Error object
 * @param {string} requestId - Request correlation ID
 * @returns {Object} Standardized error response
 */
function createErrorResponse(error, requestId = null) {
  let errorInfo;
  
  if (error.code && error.code.startsWith('23')) {
    // PostgreSQL constraint error
    errorInfo = mapDatabaseError(error);
  } else if (error instanceof DatabaseError) {
    // Custom database error
    errorInfo = {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details
    };
  } else if (error.statusCode) {
    // Error with status code already set
    errorInfo = {
      statusCode: error.statusCode,
      code: error.code || 'ERROR',
      message: error.message,
      details: error.details || []
    };
  } else {
    // Generic error
    errorInfo = {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      details: []
    };
  }
  
  const response = {
    error: {
      code: errorInfo.code,
      message: errorInfo.message,
      details: errorInfo.details
    }
  };
  
  if (requestId) {
    response.error.request_id = requestId;
  }
  
  // Don't expose sensitive information in production
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    response.error.stack = error.stack;
  }
  
  return {
    statusCode: errorInfo.statusCode,
    body: response
  };
}

/**
 * Check if an error is retryable
 * @param {Error} error - Error object
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(error) {
  const pgCode = error.code;
  
  return (
    pgCode === ERROR_CODES.SERIALIZATION_FAILURE ||
    pgCode === ERROR_CODES.DEADLOCK_DETECTED ||
    pgCode === ERROR_CODES.CONNECTION_EXCEPTION ||
    pgCode === ERROR_CODES.CONNECTION_FAILURE ||
    (error.message && error.message.includes('timeout'))
  );
}

module.exports = {
  ERROR_CODES,
  DatabaseError,
  mapDatabaseError,
  createErrorResponse,
  isRetryableError
};
