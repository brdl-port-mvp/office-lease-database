/**
 * Structured Logging Utility
 * Provides JSON-formatted logs with correlation IDs and context
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'] || LOG_LEVELS.INFO;

/**
 * Generate a correlation ID for request tracing
 * @returns {string} Correlation ID
 */
function generateCorrelationId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a structured log entry
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 * @returns {Object} Structured log entry
 */
function createLogEntry(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };
  
  // Add Lambda context if available
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    entry.lambda = {
      functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
      requestId: process.env.AWS_REQUEST_ID
    };
  }
  
  return entry;
}

/**
 * Redact sensitive information from logs
 * @param {Object} data - Data to redact
 * @returns {Object} Redacted data
 */
function redactSensitive(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'authorization'];
  const redacted = { ...data };
  
  for (const key in redacted) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object') {
      redacted[key] = redactSensitive(redacted[key]);
    }
  }
  
  return redacted;
}

/**
 * Log a debug message
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 */
function debug(message, context = {}) {
  if (currentLogLevel <= LOG_LEVELS.DEBUG) {
    const entry = createLogEntry('DEBUG', message, redactSensitive(context));
    console.log(JSON.stringify(entry));
  }
}

/**
 * Log an info message
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 */
function info(message, context = {}) {
  if (currentLogLevel <= LOG_LEVELS.INFO) {
    const entry = createLogEntry('INFO', message, redactSensitive(context));
    console.log(JSON.stringify(entry));
  }
}

/**
 * Log a warning message
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 */
function warn(message, context = {}) {
  if (currentLogLevel <= LOG_LEVELS.WARN) {
    const entry = createLogEntry('WARN', message, redactSensitive(context));
    console.warn(JSON.stringify(entry));
  }
}

/**
 * Log an error message
 * @param {string} message - Log message
 * @param {Error|Object} error - Error object or context
 */
function error(message, error = {}) {
  if (currentLogLevel <= LOG_LEVELS.ERROR) {
    const context = error instanceof Error ? {
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack
      }
    } : error;
    
    const entry = createLogEntry('ERROR', message, redactSensitive(context));
    console.error(JSON.stringify(entry));
  }
}

/**
 * Log a database query
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {number} duration - Query duration in ms
 * @param {number} rowCount - Number of rows affected
 */
function logQuery(query, params = [], duration = 0, rowCount = 0) {
  if (currentLogLevel <= LOG_LEVELS.DEBUG) {
    debug('Database query executed', {
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''), // Truncate long queries
      paramCount: params.length,
      duration: `${duration}ms`,
      rowCount
    });
  }
}

/**
 * Log an API request
 * @param {Object} event - Lambda event object
 * @param {string} correlationId - Request correlation ID
 */
function logRequest(event, correlationId) {
  info('API request received', {
    correlationId,
    httpMethod: event.httpMethod,
    path: event.path,
    queryParams: event.queryStringParameters,
    headers: redactSensitive(event.headers)
  });
}

/**
 * Log an API response
 * @param {number} statusCode - HTTP status code
 * @param {string} correlationId - Request correlation ID
 * @param {number} duration - Request duration in ms
 */
function logResponse(statusCode, correlationId, duration) {
  info('API response sent', {
    correlationId,
    statusCode,
    duration: `${duration}ms`
  });
}

/**
 * Log a transaction event
 * @param {string} action - Transaction action (begin, commit, rollback)
 * @param {string} correlationId - Request correlation ID
 */
function logTransaction(action, correlationId = null) {
  debug(`Transaction ${action}`, {
    correlationId,
    action
  });
}

module.exports = {
  debug,
  info,
  warn,
  error,
  logQuery,
  logRequest,
  logResponse,
  logTransaction,
  generateCorrelationId,
  redactSensitive
};
