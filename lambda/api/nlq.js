/**
 * Natural Language Query API Lambda Function
 * Handles natural language queries and translates them to SQL
 */

const db = require('./db');
const { classifyIntent } = require('./nlq/intent-classifier');
const { generateSQL, validateSQL } = require('./nlq/sql-generator');

/**
 * Lambda handler for natural language query endpoint
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    // Natural language queries are read-only, so analyst_ro role should have access
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, body } = event;
    
    // Only accept POST requests
    if (httpMethod !== 'POST') {
      return createResponse(405, { 
        error: { 
          code: 'METHOD_NOT_ALLOWED', 
          message: `Method ${httpMethod} not allowed. Use POST.` 
        } 
      }, correlationId);
    }
    
    // Parse request body
    let requestBody;
    try {
      requestBody = typeof body === 'string' ? JSON.parse(body) : body;
    } catch (error) {
      return createResponse(400, {
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON',
          details: [{ field: 'body', message: error.message }]
        }
      }, correlationId);
    }
    
    // Validate query field
    if (!requestBody.query || typeof requestBody.query !== 'string') {
      return createResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing or invalid query field',
          details: [{ field: 'query', message: 'Query must be a non-empty string' }]
        }
      }, correlationId);
    }
    
    const query = requestBody.query.trim();
    
    if (query.length === 0) {
      return createResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query cannot be empty',
          details: [{ field: 'query', message: 'Query must contain text' }]
        }
      }, correlationId);
    }
    
    if (query.length > 500) {
      return createResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query too long',
          details: [{ field: 'query', message: 'Query must be 500 characters or less' }]
        }
      }, correlationId);
    }
    
    db.logger.info('Processing natural language query', { query, correlationId });
    
    // Step 1: Classify intent
    const classificationStart = Date.now();
    const intent = await classifyIntent(query);
    const classificationTime = Date.now() - classificationStart;
    
    db.logger.info('Intent classified', { 
      intent: intent.intent, 
      confidence: intent.confidence,
      classificationTime: `${classificationTime}ms`,
      correlationId 
    });
    
    // Check for classification errors
    if (intent.error) {
      return createResponse(200, {
        query,
        intent: intent.intent,
        confidence: intent.confidence,
        clarification: intent.error,
        results: [],
        metadata: {
          intent: intent.intent,
          confidence: intent.confidence,
          classification_time_ms: classificationTime,
          execution_time_ms: 0,
          total_time_ms: Date.now() - startTime,
          request_id: correlationId
        }
      }, correlationId);
    }
    
    // Step 2: Generate SQL
    const sqlGenerationStart = Date.now();
    const sqlResult = generateSQL(intent);
    const sqlGenerationTime = Date.now() - sqlGenerationStart;
    
    // Check for SQL generation errors or clarifications needed
    if (sqlResult.error) {
      return createResponse(200, {
        query,
        intent: intent.intent,
        confidence: intent.confidence,
        clarification: sqlResult.clarification || sqlResult.error,
        results: [],
        metadata: {
          intent: intent.intent,
          confidence: intent.confidence,
          classification_time_ms: classificationTime,
          sql_generation_time_ms: sqlGenerationTime,
          execution_time_ms: 0,
          total_time_ms: Date.now() - startTime,
          request_id: correlationId
        }
      }, correlationId);
    }
    
    db.logger.info('SQL generated', { 
      view: sqlResult.view,
      sqlGenerationTime: `${sqlGenerationTime}ms`,
      correlationId 
    });
    
    // Step 3: Validate SQL for security
    const validation = validateSQL(sqlResult.sql);
    if (!validation.valid) {
      db.logger.error('SQL validation failed', { 
        error: validation.error, 
        correlationId 
      });
      
      return createResponse(400, {
        error: {
          code: 'SECURITY_ERROR',
          message: 'Query validation failed',
          details: [{ message: validation.error }]
        }
      }, correlationId);
    }
    
    // Step 4: Execute SQL query
    const executionStart = Date.now();
    let results;
    
    try {
      results = await db.queryRows(sqlResult.sql, sqlResult.values, {
        logQuery: true,
        timeout: 30000
      });
    } catch (dbError) {
      db.logger.error('Query execution failed', { 
        error: dbError.message, 
        code: dbError.code,
        correlationId 
      });
      
      const errorResponse = db.createErrorResponse(dbError, correlationId);
      return createResponse(errorResponse.statusCode, errorResponse.body, correlationId);
    }
    
    const executionTime = Date.now() - executionStart;
    const totalTime = Date.now() - startTime;
    
    db.logger.info('Query executed successfully', { 
      resultCount: results.length,
      executionTime: `${executionTime}ms`,
      totalTime: `${totalTime}ms`,
      correlationId 
    });
    
    // Step 5: Format response
    const response = {
      query,
      intent: intent.intent,
      confidence: intent.confidence,
      results,
      metadata: {
        intent: intent.intent,
        confidence: intent.confidence,
        parameters: intent.parameters,
        view: sqlResult.view,
        result_count: results.length,
        classification_time_ms: classificationTime,
        sql_generation_time_ms: sqlGenerationTime,
        execution_time_ms: executionTime,
        total_time_ms: totalTime,
        request_id: correlationId
      }
    };
    
    // Add SQL in debug mode
    if (process.env.LOG_LEVEL === 'DEBUG' || requestBody.debug === true) {
      response.debug = {
        sql: sqlResult.sql,
        values: sqlResult.values,
        description: sqlResult.description
      };
    }
    
    db.logger.logResponse(200, correlationId, totalTime);
    
    return createResponse(200, response, correlationId);
    
  } catch (error) {
    db.logger.error('Natural language query API error', error);
    
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
 * Create HTTP response
 */
function createResponse(statusCode, body, correlationId = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (correlationId) {
    headers['X-Correlation-ID'] = correlationId;
  }
  
  return {
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
}
