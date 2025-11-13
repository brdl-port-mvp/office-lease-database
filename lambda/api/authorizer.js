/**
 * Lambda Authorizer for API Gateway
 * Validates IAM signatures and generates IAM policy documents based on role
 */

const AWS = require('aws-sdk');

// Cache for authorization decisions (5 minutes TTL)
const authCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Lambda handler for API Gateway authorizer
 */
exports.handler = async (event) => {
  console.log('Authorizer invoked', JSON.stringify({ 
    type: event.type,
    methodArn: event.methodArn,
    requestContext: event.requestContext 
  }));

  try {
    // Extract IAM principal from request context
    const principal = extractPrincipal(event);
    
    if (!principal) {
      console.error('No IAM principal found in request');
      throw new Error('Unauthorized');
    }

    // Extract role from principal
    const role = extractRole(principal);
    
    if (!role) {
      console.error('Unable to extract role from principal', { principal });
      throw new Error('Unauthorized');
    }

    // Check cache for existing authorization decision
    const cacheKey = `${principal}:${event.methodArn}`;
    const cachedPolicy = getCachedPolicy(cacheKey);
    
    if (cachedPolicy) {
      console.log('Returning cached authorization policy', { principal, role });
      return cachedPolicy;
    }

    // Generate IAM policy based on role
    const policy = generatePolicy(principal, role, event.methodArn);
    
    // Cache the policy
    setCachedPolicy(cacheKey, policy);
    
    console.log('Authorization successful', { 
      principal, 
      role, 
      effect: policy.policyDocument.Statement[0].Effect 
    });
    
    return policy;
    
  } catch (error) {
    console.error('Authorization failed', { error: error.message });
    
    // Return 403 Forbidden for unauthorized access
    throw new Error('Unauthorized');
  }
};

/**
 * Extract IAM principal from event
 */
function extractPrincipal(event) {
  // For IAM authentication via API Gateway
  if (event.requestContext?.identity?.userArn) {
    return event.requestContext.identity.userArn;
  }
  
  // For IAM authentication via Lambda invoke
  if (event.requestContext?.identity?.caller) {
    return event.requestContext.identity.caller;
  }
  
  // For assumed role
  if (event.requestContext?.identity?.principalOrgId) {
    return event.requestContext.identity.principalOrgId;
  }
  
  // Fallback to accountId if available
  if (event.requestContext?.accountId) {
    return `arn:aws:iam::${event.requestContext.accountId}:root`;
  }
  
  return null;
}

/**
 * Extract role from IAM principal ARN
 * Supports both IAM roles and assumed roles
 */
function extractRole(principalArn) {
  // Pattern: arn:aws:iam::account-id:role/role-name
  // Pattern: arn:aws:sts::account-id:assumed-role/role-name/session-name
  
  const rolePatterns = [
    /arn:aws:iam::\d+:role\/(lease_app_rw|analyst_ro|admin_dba)/,
    /arn:aws:sts::\d+:assumed-role\/(lease_app_rw|analyst_ro|admin_dba)/
  ];
  
  for (const pattern of rolePatterns) {
    const match = principalArn.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Generate IAM policy document based on role
 */
function generatePolicy(principalId, role, methodArn) {
  // Parse the method ARN to extract API Gateway details
  // Format: arn:aws:execute-api:region:account-id:api-id/stage/method/resource
  const arnParts = methodArn.split(':');
  const apiGatewayArnPart = arnParts[5].split('/');
  const region = arnParts[3];
  const accountId = arnParts[4];
  const apiId = apiGatewayArnPart[0];
  const stage = apiGatewayArnPart[1];
  
  // Base ARN for all API resources
  const baseArn = `arn:aws:execute-api:${region}:${accountId}:${apiId}/${stage}`;
  
  // Define permissions based on role
  let allowedResources = [];
  let deniedResources = [];
  
  switch (role) {
    case 'lease_app_rw':
      // Full CRUD access to all endpoints
      allowedResources = [
        `${baseArn}/*/*`, // All methods on all resources
      ];
      break;
      
    case 'analyst_ro':
      // Read-only access: GET on all endpoints, no POST/PUT/DELETE
      allowedResources = [
        `${baseArn}/GET/*`, // All GET requests
        `${baseArn}/OPTIONS/*`, // CORS preflight
      ];
      deniedResources = [
        `${baseArn}/POST/*`,
        `${baseArn}/PUT/*`,
        `${baseArn}/DELETE/*`,
        `${baseArn}/PATCH/*`,
      ];
      break;
      
    case 'admin_dba':
      // Full access including administrative endpoints
      allowedResources = [
        `${baseArn}/*/*`, // All methods on all resources
      ];
      break;
      
    default:
      // Unknown role - deny all access
      deniedResources = [`${baseArn}/*/*`];
  }
  
  // Build policy document
  const policyDocument = {
    Version: '2012-10-17',
    Statement: []
  };
  
  // Add allow statements
  if (allowedResources.length > 0) {
    policyDocument.Statement.push({
      Action: 'execute-api:Invoke',
      Effect: 'Allow',
      Resource: allowedResources
    });
  }
  
  // Add deny statements
  if (deniedResources.length > 0) {
    policyDocument.Statement.push({
      Action: 'execute-api:Invoke',
      Effect: 'Deny',
      Resource: deniedResources
    });
  }
  
  // If no statements, deny all
  if (policyDocument.Statement.length === 0) {
    policyDocument.Statement.push({
      Action: 'execute-api:Invoke',
      Effect: 'Deny',
      Resource: `${baseArn}/*/*`
    });
  }
  
  // Return policy with context
  return {
    principalId: principalId,
    policyDocument: policyDocument,
    context: {
      role: role,
      principalArn: principalId,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Get cached policy if still valid
 */
function getCachedPolicy(cacheKey) {
  const cached = authCache.get(cacheKey);
  
  if (!cached) {
    return null;
  }
  
  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL_MS) {
    // Cache expired
    authCache.delete(cacheKey);
    return null;
  }
  
  return cached.policy;
}

/**
 * Cache policy with timestamp
 */
function setCachedPolicy(cacheKey, policy) {
  authCache.set(cacheKey, {
    policy: policy,
    timestamp: Date.now()
  });
  
  // Clean up old cache entries periodically
  if (authCache.size > 1000) {
    cleanupCache();
  }
}

/**
 * Clean up expired cache entries
 */
function cleanupCache() {
  const now = Date.now();
  const keysToDelete = [];
  
  for (const [key, value] of authCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => authCache.delete(key));
  
  console.log(`Cache cleanup: removed ${keysToDelete.length} expired entries`);
}
