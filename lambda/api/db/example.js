/**
 * Database Layer Usage Examples
 * Demonstrates how to use the database connection layer
 */

const db = require('./index');

/**
 * Example 1: Simple query execution
 */
async function exampleSimpleQuery() {
  try {
    // Query all active properties
    const properties = await db.queryRows(
      'SELECT * FROM property WHERE active = $1 ORDER BY name',
      [true]
    );
    
    console.log(`Found ${properties.length} active properties`);
    return properties;
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
}

/**
 * Example 2: Single row query
 */
async function exampleGetProperty(propertyId) {
  try {
    const property = await db.queryOne(
      'SELECT * FROM property WHERE property_id = $1',
      [propertyId]
    );
    
    if (!property) {
      throw new Error('Property not found');
    }
    
    return property;
  } catch (error) {
    console.error('Failed to get property:', error);
    throw error;
  }
}

/**
 * Example 3: Insert with RETURNING
 */
async function exampleCreateProperty(data) {
  try {
    const result = await db.query(
      `INSERT INTO property (name, address, state, postal_code, country, total_rsf, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.name,
        data.address,
        data.state,
        data.postal_code,
        data.country || 'USA',
        data.total_rsf,
        true
      ]
    );
    
    console.log(`Created property with ID: ${result.rows[0].property_id}`);
    return result.rows[0];
  } catch (error) {
    console.error('Failed to create property:', error);
    throw error;
  }
}

/**
 * Example 4: Transaction with withTransaction (recommended)
 */
async function exampleCreateLeaseWithVersion(leaseData, versionData) {
  try {
    const result = await db.withTransaction(async (client) => {
      // Insert lease
      const leaseResult = await client.query(
        `INSERT INTO lease (property_id, landlord_id, tenant_id, master_lease_num, execution_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          leaseData.property_id,
          leaseData.landlord_id,
          leaseData.tenant_id,
          leaseData.master_lease_num,
          leaseData.execution_date
        ]
      );
      
      const lease = leaseResult.rows[0];
      
      // Insert initial lease version
      const versionResult = await client.query(
        `INSERT INTO lease_version (
          lease_id, version_num, effective_daterange, suite_id,
          premises_rsf, term_months, base_year, escalation_method,
          currency_code, is_current, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          lease.lease_id,
          0, // Initial version
          versionData.effective_daterange,
          versionData.suite_id,
          versionData.premises_rsf,
          versionData.term_months,
          versionData.base_year,
          versionData.escalation_method,
          'USD',
          true, // is_current
          versionData.notes
        ]
      );
      
      return {
        lease: lease,
        version: versionResult.rows[0]
      };
    });
    
    console.log(`Created lease ${result.lease.lease_id} with version ${result.version.lease_version_id}`);
    return result;
  } catch (error) {
    console.error('Failed to create lease with version:', error);
    throw error;
  }
}

/**
 * Example 5: Manual transaction management
 */
async function exampleManualTransaction(leaseId, newVersionData) {
  const client = await db.beginTransaction();
  
  try {
    // Set current version to false
    await client.query(
      'UPDATE lease_version SET is_current = false WHERE lease_id = $1 AND is_current = true',
      [leaseId]
    );
    
    // Get next version number
    const maxVersionResult = await client.query(
      'SELECT COALESCE(MAX(version_num), -1) + 1 as next_version FROM lease_version WHERE lease_id = $1',
      [leaseId]
    );
    const nextVersion = maxVersionResult.rows[0].next_version;
    
    // Insert new version
    const result = await client.query(
      `INSERT INTO lease_version (lease_id, version_num, effective_daterange, is_current, ...)
       VALUES ($1, $2, $3, true, ...)
       RETURNING *`,
      [leaseId, nextVersion, newVersionData.effective_daterange]
    );
    
    await db.commitTransaction(client);
    
    console.log(`Created amendment version ${nextVersion} for lease ${leaseId}`);
    return result.rows[0];
  } catch (error) {
    await db.rollbackTransaction(client);
    console.error('Transaction failed, rolled back:', error);
    throw error;
  }
}

/**
 * Example 6: Error handling with HTTP response
 */
async function exampleWithErrorHandling(event) {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  try {
    db.logger.logRequest(event, correlationId);
    
    // Attempt to create a property
    const property = await db.queryOne(
      `INSERT INTO property (name, address, state, postal_code, country, total_rsf, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      ['Building A', '123 Main St', 'CA', '90210', 'USA', 50000, true]
    );
    
    const duration = Date.now() - startTime;
    db.logger.logResponse(201, correlationId, duration);
    
    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId
      },
      body: JSON.stringify(property)
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    db.logger.error('Request failed', error);
    
    // Map database error to HTTP response
    const errorResponse = db.createErrorResponse(error, correlationId);
    
    db.logger.logResponse(errorResponse.statusCode, correlationId, duration);
    
    return {
      statusCode: errorResponse.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId
      },
      body: JSON.stringify(errorResponse.body)
    };
  }
}

/**
 * Example 7: Query with options
 */
async function exampleQueryWithOptions() {
  try {
    // Query with logging enabled and custom timeout
    const result = await db.query(
      'SELECT * FROM vw_rent_roll_current WHERE property_id = $1',
      [123],
      {
        logQuery: true,
        timeout: 5000 // 5 second timeout
      }
    );
    
    return result.rows;
  } catch (error) {
    if (error.message.includes('timeout')) {
      console.error('Query timed out after 5 seconds');
    }
    throw error;
  }
}

/**
 * Example 8: Pool statistics monitoring
 */
async function exampleMonitorPool() {
  const stats = db.getPoolStats();
  
  console.log('Pool Statistics:', {
    initialized: stats.initialized,
    totalConnections: stats.totalCount,
    idleConnections: stats.idleCount,
    waitingRequests: stats.waitingCount
  });
  
  // Alert if pool is exhausted
  if (stats.waitingCount > 0) {
    db.logger.warn('Connection pool exhausted', {
      waiting: stats.waitingCount,
      total: stats.totalCount
    });
  }
}

/**
 * Example 9: Checking for retryable errors
 */
async function exampleRetryableError() {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const result = await db.query(
        'UPDATE lease_version SET is_current = true WHERE lease_version_id = $1',
        [123]
      );
      return result;
    } catch (error) {
      if (db.isRetryableError(error) && attempt < maxRetries - 1) {
        attempt++;
        const delay = Math.pow(2, attempt) * 100; // Exponential backoff
        db.logger.warn(`Retryable error, attempt ${attempt}/${maxRetries}`, {
          error: error.message,
          delay
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

module.exports = {
  exampleSimpleQuery,
  exampleGetProperty,
  exampleCreateProperty,
  exampleCreateLeaseWithVersion,
  exampleManualTransaction,
  exampleWithErrorHandling,
  exampleQueryWithOptions,
  exampleMonitorPool,
  exampleRetryableError
};
