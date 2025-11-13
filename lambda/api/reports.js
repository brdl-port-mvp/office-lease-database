/**
 * Reports API Lambda Function
 * Handles reporting endpoints for lease data analytics
 */

const db = require('./db');

/**
 * Lambda handler for reports endpoints
 */
exports.handler = async (event) => {
  const correlationId = db.logger.generateCorrelationId();
  const startTime = Date.now();
  
  db.logger.logRequest(event, correlationId);
  
  try {
    // Authorize request based on role and HTTP method
    // Reports are read-only, so analyst_ro role should have access
    const authResult = db.authorization.authorizeRequest(event);
    
    const { httpMethod, path, queryStringParameters } = event;
    
    if (httpMethod !== 'GET') {
      return createResponse(405, { 
        error: { 
          code: 'METHOD_NOT_ALLOWED', 
          message: `Method ${httpMethod} not allowed for reports` 
        } 
      }, correlationId);
    }
    
    let result;
    
    // Route to appropriate report handler
    if (path.includes('/expirations')) {
      result = await getExpirationsReport(queryStringParameters || {});
    } else if (path.includes('/rent-roll')) {
      result = await getRentRollReport(queryStringParameters || {});
    } else if (path.includes('/options')) {
      result = await getOptionsReport(queryStringParameters || {});
    } else if (path.includes('/free-rent')) {
      result = await getFreeRentReport(queryStringParameters || {});
    } else if (path.includes('/ti-allowances')) {
      result = await getTIAllowancesReport(queryStringParameters || {});
    } else if (path.includes('/critical-dates')) {
      result = await getCriticalDatesReport(queryStringParameters || {});
    } else if (path.includes('/amendments')) {
      result = await getAmendmentsReport(queryStringParameters || {});
    } else if (path.includes('/opex-summary')) {
      result = await getOpExSummaryReport(queryStringParameters || {});
    } else {
      return createResponse(404, { 
        error: { 
          code: 'NOT_FOUND', 
          message: 'Report endpoint not found' 
        } 
      }, correlationId);
    }
    
    const duration = Date.now() - startTime;
    db.logger.logResponse(result.statusCode, correlationId, duration);
    
    return createResponse(result.statusCode, result.body, correlationId);
    
  } catch (error) {
    db.logger.error('Reports API error', error);
    
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
 * Get expirations report
 * Query params: months, state, property_id, sort_by, sort_order, limit, offset
 */
async function getExpirationsReport(params) {
  const {
    months,
    state,
    property_id,
    sort_by = 'expiration_date',
    sort_order = 'ASC',
    limit = '50',
    offset = '0'
  } = params;
  
  // Validate sort parameters
  const allowedSortFields = ['expiration_date', 'months_to_expiration', 'tenant_name', 'property_name'];
  const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'expiration_date';
  const sortOrder = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (months) {
    const monthsNum = parseFloat(months);
    if (!isNaN(monthsNum) && monthsNum > 0) {
      conditions.push(`months_to_expiration <= $${paramCount}`);
      values.push(monthsNum);
      paramCount++;
    }
  }
  
  if (state) {
    conditions.push(`state = $${paramCount}`);
    values.push(state);
    paramCount++;
  }
  
  if (property_id) {
    conditions.push(`lease_id IN (
      SELECT lease_id FROM lease WHERE property_id = $${paramCount}
    )`);
    values.push(parseInt(property_id, 10));
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM vw_expirations ${whereClause}`;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      lease_id,
      master_lease_num,
      tenant_name,
      property_name,
      state,
      expiration_date,
      ROUND(months_to_expiration::numeric, 2) as months_to_expiration
    FROM vw_expirations
    ${whereClause}
    ORDER BY ${sortField} ${sortOrder}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const expirations = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: expirations,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: expirations.length
      }
    }
  };
}

/**
 * Get rent roll report
 * Query params: date, property_id, format, limit, offset
 */
async function getRentRollReport(params) {
  const {
    date,
    property_id,
    format = 'json',
    limit = '50',
    offset = '0'
  } = params;
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  // Note: vw_rent_roll_current already filters by CURRENT_DATE
  // If a specific date is provided, we need to query rent_schedule directly
  if (date) {
    // For custom date, query directly instead of using the view
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid date format',
            details: [{ field: 'date', message: 'Date must be in YYYY-MM-DD format' }]
          }
        }
      };
    }
  }
  
  if (property_id) {
    conditions.push(`lease_id IN (
      SELECT lease_id FROM lease WHERE property_id = $${paramCount}
    )`);
    values.push(parseInt(property_id, 10));
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM vw_rent_roll_current ${whereClause}`;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      lease_id,
      master_lease_num,
      tenant_name,
      property_name,
      period_start,
      period_end,
      basis,
      amount,
      ROUND(monthly_equiv::numeric, 2) as monthly_equiv,
      ROUND(annualized_equiv::numeric, 2) as annualized_equiv
    FROM vw_rent_roll_current
    ${whereClause}
    ORDER BY property_name, tenant_name
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const rentRoll = await db.queryRows(dataQuery, values);
  
  // Handle CSV format
  if (format.toLowerCase() === 'csv') {
    const csv = convertToCSV(rentRoll, [
      'lease_id', 'master_lease_num', 'tenant_name', 'property_name',
      'period_start', 'period_end', 'basis', 'amount', 'monthly_equiv', 'annualized_equiv'
    ]);
    
    return {
      statusCode: 200,
      body: csv,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="rent-roll.csv"'
      }
    };
  }
  
  return {
    statusCode: 200,
    body: {
      data: rentRoll,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: rentRoll.length
      }
    }
  };
}

/**
 * Get options status report
 * Query params: type, window_status, exercised, limit, offset
 */
async function getOptionsReport(params) {
  const {
    type,
    window_status,
    exercised,
    limit = '50',
    offset = '0'
  } = params;
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (type) {
    const validTypes = ['RENEWAL', 'TERMINATION', 'EXPANSION', 'ROFR', 'OTHER'];
    if (validTypes.includes(type.toUpperCase())) {
      conditions.push(`option_type = $${paramCount}`);
      values.push(type.toUpperCase());
      paramCount++;
    }
  }
  
  if (window_status) {
    if (window_status.toLowerCase() === 'open') {
      conditions.push(`notice_window_open = TRUE`);
    } else if (window_status.toLowerCase() === 'closed') {
      conditions.push(`notice_window_open = FALSE`);
    }
  }
  
  if (exercised !== undefined) {
    conditions.push(`exercised = $${paramCount}`);
    values.push(exercised === 'true' || exercised === true);
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM vw_options_status ${whereClause}`;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      lease_id,
      master_lease_num,
      tenant_name,
      property_name,
      option_type,
      window_start,
      window_end,
      notice_window_open,
      terms,
      exercised,
      exercised_date
    FROM vw_options_status
    ${whereClause}
    ORDER BY window_start
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const options = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: options,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: options.length
      }
    }
  };
}

/**
 * Get free rent status report
 * Query params: active_only, limit, offset
 */
async function getFreeRentReport(params) {
  const {
    active_only,
    limit = '50',
    offset = '0'
  } = params;
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  // vw_free_rent_status already filters for active free rent (end date > CURRENT_DATE)
  // If active_only is false, we need to query differently
  if (active_only === 'false' || active_only === false) {
    // Query all free rent concessions, not just active ones
    const countQuery = `
      SELECT COUNT(*) as total
      FROM vw_current_lease cl
      INNER JOIN concession c ON cl.lease_version_id = c.lease_version_id
      WHERE c.kind = 'FREE_RENT'
    `;
    const countResult = await db.queryOne(countQuery, []);
    const total = parseInt(countResult.total, 10);
    
    const dataQuery = `
      SELECT 
        cl.lease_id,
        cl.master_lease_num,
        t.legal_name AS tenant_name,
        p.name AS property_name,
        LOWER(c.applies_daterange) AS free_rent_start,
        UPPER(c.applies_daterange) AS free_rent_end,
        c.value_amount,
        c.value_basis,
        CASE 
          WHEN UPPER(c.applies_daterange) > CURRENT_DATE 
          THEN ROUND((EXTRACT(EPOCH FROM (UPPER(c.applies_daterange) - CURRENT_DATE)) / (30 * 86400))::numeric, 2)
          ELSE 0
        END AS approx_months_remaining
      FROM vw_current_lease cl
      INNER JOIN concession c ON cl.lease_version_id = c.lease_version_id
      INNER JOIN party t ON cl.tenant_id = t.party_id
      INNER JOIN property p ON cl.property_id = p.property_id
      WHERE c.kind = 'FREE_RENT'
      ORDER BY free_rent_end DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    values.push(parseInt(limit, 10), parseInt(offset, 10));
    const freeRent = await db.queryRows(dataQuery, values);
    
    return {
      statusCode: 200,
      body: {
        data: freeRent,
        pagination: {
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          count: freeRent.length
        }
      }
    };
  }
  
  // Default: active only (using the view)
  const countQuery = `SELECT COUNT(*) as total FROM vw_free_rent_status`;
  const countResult = await db.queryOne(countQuery, []);
  const total = parseInt(countResult.total, 10);
  
  const dataQuery = `
    SELECT 
      lease_id,
      master_lease_num,
      tenant_name,
      property_name,
      free_rent_start,
      free_rent_end,
      value_amount,
      value_basis,
      ROUND(approx_months_remaining::numeric, 2) as approx_months_remaining
    FROM vw_free_rent_status
    ORDER BY free_rent_end
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const freeRent = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: freeRent,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: freeRent.length
      }
    }
  };
}

/**
 * Get TI allowances summary report
 * Query params: lease_id, property_id, tenant_name, limit, offset
 */
async function getTIAllowancesReport(params) {
  const {
    lease_id,
    property_id,
    tenant_name,
    limit = '50',
    offset = '0'
  } = params;
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (lease_id) {
    conditions.push(`lease_id = $${paramCount}`);
    values.push(parseInt(lease_id, 10));
    paramCount++;
  }
  
  if (property_id) {
    conditions.push(`lease_id IN (
      SELECT lease_id FROM lease WHERE property_id = $${paramCount}
    )`);
    values.push(parseInt(property_id, 10));
    paramCount++;
  }
  
  if (tenant_name) {
    conditions.push(`tenant_name ILIKE $${paramCount}`);
    values.push(`%${tenant_name}%`);
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM vw_ti_allowance_summary ${whereClause}`;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      lease_id,
      master_lease_num,
      tenant_name,
      property_name,
      ROUND(total_ti_amount::numeric, 2) as total_ti_amount
    FROM vw_ti_allowance_summary
    ${whereClause}
    ORDER BY total_ti_amount DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const tiAllowances = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: tiAllowances,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: tiAllowances.length
      }
    }
  };
}

/**
 * Get critical dates report
 * Query params: days_ahead, kind, lease_id, limit, offset
 */
async function getCriticalDatesReport(params) {
  const {
    days_ahead = '180',
    kind,
    lease_id,
    limit = '50',
    offset = '0'
  } = params;
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  // Custom days_ahead filter
  const daysAheadNum = parseInt(days_ahead, 10);
  if (!isNaN(daysAheadNum) && daysAheadNum !== 180) {
    conditions.push(`date_value BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${daysAheadNum} days'`);
  }
  
  if (kind) {
    const validKinds = ['COMMENCEMENT', 'RENT_START', 'EXPIRATION', 'NOTICE', 'OTHER'];
    if (validKinds.includes(kind.toUpperCase())) {
      conditions.push(`kind = $${paramCount}`);
      values.push(kind.toUpperCase());
      paramCount++;
    }
  }
  
  if (lease_id) {
    conditions.push(`lease_id = $${paramCount}`);
    values.push(parseInt(lease_id, 10));
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM vw_critical_dates_upcoming 
    ${whereClause}
  `;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      lease_id,
      master_lease_num,
      tenant_name,
      property_name,
      kind,
      date_value
    FROM vw_critical_dates_upcoming
    ${whereClause}
    ORDER BY date_value ASC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const criticalDates = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: criticalDates,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: criticalDates.length
      }
    }
  };
}

/**
 * Get amendment history report
 * Query params: lease_id, limit, offset
 */
async function getAmendmentsReport(params) {
  const {
    lease_id,
    limit = '50',
    offset = '0'
  } = params;
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (lease_id) {
    conditions.push(`lease_id = $${paramCount}`);
    values.push(parseInt(lease_id, 10));
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM vw_amendment_history ${whereClause}`;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      lease_id,
      master_lease_num,
      lease_version_id,
      version_num,
      effective_start,
      effective_end,
      is_current
    FROM vw_amendment_history
    ${whereClause}
    ORDER BY lease_id, version_num
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const amendments = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: amendments,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: amendments.length
      }
    }
  };
}

/**
 * Get OpEx summary report
 * Query params: property_id, limit, offset
 */
async function getOpExSummaryReport(params) {
  const {
    property_id,
    limit = '50',
    offset = '0'
  } = params;
  
  // Build WHERE clause
  const conditions = [];
  const values = [];
  let paramCount = 1;
  
  if (property_id) {
    conditions.push(`lease_id IN (
      SELECT lease_id FROM lease WHERE property_id = $${paramCount}
    )`);
    values.push(parseInt(property_id, 10));
    paramCount++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM vw_opex_summary ${whereClause}`;
  const countResult = await db.queryOne(countQuery, values);
  const total = parseInt(countResult.total, 10);
  
  // Get paginated results
  const dataQuery = `
    SELECT 
      lease_id,
      master_lease_num,
      property_name,
      method,
      stop_amount,
      gross_up_pct
    FROM vw_opex_summary
    ${whereClause}
    ORDER BY property_name, master_lease_num
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  values.push(parseInt(limit, 10), parseInt(offset, 10));
  const opexSummary = await db.queryRows(dataQuery, values);
  
  return {
    statusCode: 200,
    body: {
      data: opexSummary,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: opexSummary.length
      }
    }
  };
}

/**
 * Convert array of objects to CSV format
 */
function convertToCSV(data, columns) {
  if (!data || data.length === 0) {
    return columns.join(',') + '\n';
  }
  
  // Header row
  const header = columns.join(',');
  
  // Data rows
  const rows = data.map(row => {
    return columns.map(col => {
      const value = row[col];
      if (value === null || value === undefined) {
        return '';
      }
      // Escape values containing commas or quotes
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',');
  });
  
  return header + '\n' + rows.join('\n');
}

/**
 * Create HTTP response
 */
function createResponse(statusCode, body, correlationId = null, headers = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  const responseHeaders = { ...defaultHeaders, ...headers };
  
  if (correlationId) {
    responseHeaders['X-Correlation-ID'] = correlationId;
  }
  
  const response = {
    statusCode,
    headers: responseHeaders,
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
  
  return response;
}
