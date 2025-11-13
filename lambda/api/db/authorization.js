/**
 * Authorization Utilities
 * Provides role-based access control for Lambda functions
 */

const logger = require('./logger');

// Role definitions
const ROLES = {
  LEASE_APP_RW: 'lease_app_rw',
  ANALYST_RO: 'analyst_ro',
  ADMIN_DBA: 'admin_dba'
};

// HTTP methods that modify data
const WRITE_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];
const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Extract role from API Gateway request context
 */
function extractRole(event) {
  // Role is injected by Lambda authorizer into request context
  if (event.requestContext?.authorizer?.role) {
    return event.requestContext.authorizer.role;
  }
  
  // Fallback: try to extract from IAM context (for direct Lambda invocation)
  if (event.requestContext?.identity?.userArn) {
    const userArn = event.requestContext.identity.userArn;
    const roleMatch = userArn.match(/role\/(lease_app_rw|analyst_ro|admin_dba)/);
    if (roleMatch && roleMatch[1]) {
      return roleMatch[1];
    }
  }
  
  return null;
}

/**
 * Extract IAM principal from request context
 */
function extractPrincipal(event) {
  // Principal ARN is injected by Lambda authorizer
  if (event.requestContext?.authorizer?.principalArn) {
    return event.requestContext.authorizer.principalArn;
  }
  
  // Fallback: try to extract from IAM context
  if (event.requestContext?.identity?.userArn) {
    return event.requestContext.identity.userArn;
  }
  
  if (event.requestContext?.identity?.caller) {
    return event.requestContext.identity.caller;
  }
  
  return 'unknown';
}

/**
 * Check if the role has permission to perform the requested operation
 */
function checkPermission(role, httpMethod) {
  if (!role) {
    return {
      allowed: false,
      reason: 'No role found in request context'
    };
  }
  
  // Normalize HTTP method
  const method = httpMethod.toUpperCase();
  
  switch (role) {
    case ROLES.LEASE_APP_RW:
      // Full CRUD access
      return {
        allowed: true,
        reason: 'lease_app_rw has full access'
      };
      
    case ROLES.ANALYST_RO:
      // Read-only access
      if (READ_METHODS.includes(method)) {
        return {
          allowed: true,
          reason: 'analyst_ro has read access'
        };
      } else if (WRITE_METHODS.includes(method)) {
        return {
          allowed: false,
          reason: 'analyst_ro does not have write access'
        };
      } else {
        return {
          allowed: false,
          reason: `analyst_ro does not support method ${method}`
        };
      }
      
    case ROLES.ADMIN_DBA:
      // Full administrative access
      return {
        allowed: true,
        reason: 'admin_dba has full access'
      };
      
    default:
      return {
        allowed: false,
        reason: `Unknown role: ${role}`
      };
  }
}

/**
 * Authorize request and throw error if not permitted
 * This should be called at the beginning of each Lambda handler
 */
function authorizeRequest(event) {
  const role = extractRole(event);
  const principal = extractPrincipal(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'UNKNOWN';
  
  // Log authorization attempt
  logger.info('Authorization check', {
    role,
    principal,
    httpMethod,
    path: event.path || event.rawPath
  });
  
  // Check permission
  const permission = checkPermission(role, httpMethod);
  
  if (!permission.allowed) {
    logger.warn('Authorization denied', {
      role,
      principal,
      httpMethod,
      reason: permission.reason
    });
    
    const error = new Error('Forbidden');
    error.statusCode = 403;
    error.code = 'FORBIDDEN';
    error.details = {
      message: 'You do not have permission to perform this operation',
      role: role || 'none',
      method: httpMethod,
      reason: permission.reason
    };
    throw error;
  }
  
  // Log successful authorization
  logger.info('Authorization granted', {
    role,
    principal,
    httpMethod,
    reason: permission.reason
  });
  
  return {
    role,
    principal,
    allowed: true
  };
}

/**
 * Check if role has read-only access
 */
function isReadOnly(role) {
  return role === ROLES.ANALYST_RO;
}

/**
 * Check if role has write access
 */
function hasWriteAccess(role) {
  return role === ROLES.LEASE_APP_RW || role === ROLES.ADMIN_DBA;
}

/**
 * Check if role has admin access
 */
function isAdmin(role) {
  return role === ROLES.ADMIN_DBA;
}

/**
 * Create a 403 Forbidden response
 */
function createForbiddenResponse(reason, correlationId = null) {
  const response = {
    statusCode: 403,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify({
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this operation',
        details: [
          {
            reason: reason
          }
        ]
      }
    })
  };
  
  if (correlationId) {
    response.headers['X-Correlation-ID'] = correlationId;
  }
  
  return response;
}

module.exports = {
  ROLES,
  extractRole,
  extractPrincipal,
  checkPermission,
  authorizeRequest,
  isReadOnly,
  hasWriteAccess,
  isAdmin,
  createForbiddenResponse
};
