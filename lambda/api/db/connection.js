/**
 * Database Connection Layer
 * Provides connection pooling, credential management, and query execution utilities
 */

const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Global connection pool instance
let pool = null;
let secretsCache = null;
let secretsCacheExpiry = null;
const SECRETS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Retrieve database credentials from AWS Secrets Manager
 * Implements caching to reduce API calls
 * @returns {Promise<Object>} Database credentials
 */
async function getCredentials() {
  const now = Date.now();
  
  // Return cached credentials if still valid
  if (secretsCache && secretsCacheExpiry && now < secretsCacheExpiry) {
    return secretsCache;
  }

  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable is not set');
  }

  try {
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secret = JSON.parse(response.SecretString);
    
    // Validate required fields
    if (!secret.username || !secret.password || !secret.host) {
      throw new Error('Secret is missing required fields (username, password, host)');
    }

    // Cache the credentials
    secretsCache = secret;
    secretsCacheExpiry = now + SECRETS_CACHE_TTL;
    
    return secret;
  } catch (error) {
    console.error('Failed to retrieve credentials from Secrets Manager:', error);
    throw new Error(`Credential retrieval failed: ${error.message}`);
  }
}

/**
 * Initialize the connection pool
 * Supports RDS Proxy and direct RDS connections
 * @returns {Promise<Pool>} PostgreSQL connection pool
 */
async function initializePool() {
  if (pool) {
    return pool;
  }

  const credentials = await getCredentials();
  const dbName = process.env.DB_NAME || 'lease_db';
  
  // RDS Proxy endpoint or direct RDS endpoint
  const host = process.env.DB_PROXY_ENDPOINT || credentials.host;
  const port = credentials.port || 5432;

  const poolConfig = {
    host,
    port,
    database: dbName,
    user: credentials.username,
    password: credentials.password,
    
    // Connection pool settings
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
    
    // SSL configuration for RDS
    ssl: process.env.DB_SSL_ENABLED !== 'false' ? {
      rejectUnauthorized: false // RDS certificates are trusted
    } : false,
    
    // Application name for monitoring
    application_name: process.env.AWS_LAMBDA_FUNCTION_NAME || 'lease-api'
  };

  pool = new Pool(poolConfig);

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });

  // Log pool events in development
  if (process.env.LOG_LEVEL === 'DEBUG') {
    pool.on('connect', () => {
      console.log('New client connected to pool');
    });
    pool.on('remove', () => {
      console.log('Client removed from pool');
    });
  }

  console.log(`Database pool initialized: ${host}:${port}/${dbName}`);
  return pool;
}

/**
 * Get the connection pool instance
 * Initializes the pool if not already created
 * @returns {Promise<Pool>} PostgreSQL connection pool
 */
async function getPool() {
  if (!pool) {
    await initializePool();
  }
  return pool;
}

/**
 * Execute a query with error handling and logging
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Query result
 */
async function query(text, params = [], options = {}) {
  const { logQuery = false, timeout = 30000 } = options;
  const startTime = Date.now();
  
  try {
    const pool = await getPool();
    
    if (logQuery || process.env.LOG_LEVEL === 'DEBUG') {
      console.log('Executing query:', { text, params });
    }

    const result = await pool.query({
      text,
      values: params,
      statement_timeout: timeout
    });

    const duration = Date.now() - startTime;
    
    if (process.env.LOG_LEVEL === 'DEBUG') {
      console.log('Query completed:', { 
        duration: `${duration}ms`, 
        rows: result.rowCount 
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Query execution failed:', {
      error: error.message,
      duration: `${duration}ms`,
      query: text,
      code: error.code
    });
    
    // Enhance error with context
    error.queryText = text;
    error.queryDuration = duration;
    throw error;
  }
}

/**
 * Execute a query and return only the rows
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @param {Object} options - Execution options
 * @returns {Promise<Array>} Query result rows
 */
async function queryRows(text, params = [], options = {}) {
  const result = await query(text, params, options);
  return result.rows;
}

/**
 * Execute a query and return a single row
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @param {Object} options - Execution options
 * @returns {Promise<Object|null>} Single row or null
 */
async function queryOne(text, params = [], options = {}) {
  const result = await query(text, params, options);
  return result.rows[0] || null;
}

/**
 * Begin a database transaction
 * @param {Object} client - Optional client from pool
 * @returns {Promise<Object>} Transaction client
 */
async function beginTransaction(client = null) {
  const txClient = client || await (await getPool()).connect();
  
  try {
    await txClient.query('BEGIN');
    console.log('Transaction started');
    return txClient;
  } catch (error) {
    if (!client) {
      txClient.release();
    }
    console.error('Failed to begin transaction:', error);
    throw error;
  }
}

/**
 * Commit a database transaction
 * @param {Object} client - Transaction client
 * @param {boolean} release - Whether to release the client back to pool
 */
async function commitTransaction(client, release = true) {
  try {
    await client.query('COMMIT');
    console.log('Transaction committed');
  } catch (error) {
    console.error('Failed to commit transaction:', error);
    throw error;
  } finally {
    if (release && client.release) {
      client.release();
    }
  }
}

/**
 * Rollback a database transaction
 * @param {Object} client - Transaction client
 * @param {boolean} release - Whether to release the client back to pool
 */
async function rollbackTransaction(client, release = true) {
  try {
    await client.query('ROLLBACK');
    console.log('Transaction rolled back');
  } catch (error) {
    console.error('Failed to rollback transaction:', error);
  } finally {
    if (release && client.release) {
      client.release();
    }
  }
}

/**
 * Execute a function within a transaction
 * Automatically handles commit/rollback and client release
 * @param {Function} callback - Async function to execute in transaction
 * @returns {Promise<any>} Result from callback
 */
async function withTransaction(callback) {
  const pool = await getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('Transaction started (withTransaction)');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    console.log('Transaction committed (withTransaction)');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction rolled back (withTransaction):', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close the connection pool
 * Should be called during Lambda shutdown or testing cleanup
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database pool closed');
  }
}

/**
 * Get pool statistics for monitoring
 * @returns {Object} Pool statistics
 */
function getPoolStats() {
  if (!pool) {
    return { initialized: false };
  }

  return {
    initialized: true,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };
}

module.exports = {
  // Connection management
  getPool,
  closePool,
  getPoolStats,
  
  // Query execution
  query,
  queryRows,
  queryOne,
  
  // Transaction management
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  withTransaction,
  
  // Credential management
  getCredentials
};
