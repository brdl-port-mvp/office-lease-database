/**
 * Database Layer - Main Export
 * Provides a unified interface for database operations
 */

const connection = require('./connection');
const errors = require('./errors');
const logger = require('./logger');
const authorization = require('./authorization');

module.exports = {
  // Connection management
  getPool: connection.getPool,
  closePool: connection.closePool,
  getPoolStats: connection.getPoolStats,
  
  // Query execution
  query: connection.query,
  queryRows: connection.queryRows,
  queryOne: connection.queryOne,
  
  // Transaction management
  beginTransaction: connection.beginTransaction,
  commitTransaction: connection.commitTransaction,
  rollbackTransaction: connection.rollbackTransaction,
  withTransaction: connection.withTransaction,
  
  // Credential management
  getCredentials: connection.getCredentials,
  
  // Error handling
  DatabaseError: errors.DatabaseError,
  mapDatabaseError: errors.mapDatabaseError,
  createErrorResponse: errors.createErrorResponse,
  isRetryableError: errors.isRetryableError,
  ERROR_CODES: errors.ERROR_CODES,
  
  // Authorization
  authorization: {
    ROLES: authorization.ROLES,
    extractRole: authorization.extractRole,
    extractPrincipal: authorization.extractPrincipal,
    checkPermission: authorization.checkPermission,
    authorizeRequest: authorization.authorizeRequest,
    isReadOnly: authorization.isReadOnly,
    hasWriteAccess: authorization.hasWriteAccess,
    isAdmin: authorization.isAdmin,
    createForbiddenResponse: authorization.createForbiddenResponse
  },
  
  // Logging
  logger: {
    debug: logger.debug,
    info: logger.info,
    warn: logger.warn,
    error: logger.error,
    logQuery: logger.logQuery,
    logRequest: logger.logRequest,
    logResponse: logger.logResponse,
    logTransaction: logger.logTransaction,
    generateCorrelationId: logger.generateCorrelationId,
    redactSensitive: logger.redactSensitive
  }
};
