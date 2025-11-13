/**
 * SQL Generator Module
 * Generates safe, parameterized SQL queries from classified intents
 */

const { INTENT_CATEGORIES } = require('./intent-classifier');

// Whitelist of allowed query patterns for security
const ALLOWED_PATTERNS = {
  [INTENT_CATEGORIES.EXPIRATION]: ['vw_expirations'],
  [INTENT_CATEGORIES.RENT_ROLL]: ['vw_rent_roll_current'],
  [INTENT_CATEGORIES.OPTIONS]: ['vw_options_status'],
  [INTENT_CATEGORIES.FINANCIAL]: ['vw_ti_allowance_summary', 'vw_free_rent_status'],
  [INTENT_CATEGORIES.CRITICAL_DATES]: ['vw_critical_dates_upcoming'],
  [INTENT_CATEGORIES.AMENDMENTS]: ['vw_amendment_history'],
  [INTENT_CATEGORIES.OPEX]: ['vw_opex_summary']
};

// Maximum result limit for safety
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * Generate SQL query from classified intent
 * @param {Object} intent - Classified intent object
 * @returns {Object} SQL query with text and parameters
 */
function generateSQL(intent) {
  if (!intent || !intent.intent) {
    return {
      error: 'Invalid intent object',
      clarification: 'Unable to understand the query. Please rephrase.'
    };
  }

  // Check if intent is supported
  if (intent.intent === INTENT_CATEGORIES.UNKNOWN) {
    return {
      error: 'Unknown intent',
      clarification: 'I don\'t understand this query. Try asking about lease expirations, rent roll, options, or financial data.'
    };
  }

  // Route to appropriate SQL generator
  switch (intent.intent) {
    case INTENT_CATEGORIES.EXPIRATION:
      return generateExpirationSQL(intent);
    
    case INTENT_CATEGORIES.RENT_ROLL:
      return generateRentRollSQL(intent);
    
    case INTENT_CATEGORIES.OPTIONS:
      return generateOptionsSQL(intent);
    
    case INTENT_CATEGORIES.FINANCIAL:
      return generateFinancialSQL(intent);
    
    case INTENT_CATEGORIES.CRITICAL_DATES:
      return generateCriticalDatesSQL(intent);
    
    case INTENT_CATEGORIES.AMENDMENTS:
      return generateAmendmentsSQL(intent);
    
    case INTENT_CATEGORIES.OPEX:
      return generateOpExSQL(intent);
    
    default:
      return {
        error: 'Unsupported intent',
        clarification: 'This type of query is not yet supported.'
      };
  }
}

/**
 * Generate SQL for expiration queries
 */
function generateExpirationSQL(intent) {
  const { parameters } = intent;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  // Handle time period (e.g., "next 6 months")
  if (parameters.time_value && parameters.time_unit) {
    if (parameters.time_unit === 'month') {
      conditions.push(`months_to_expiration <= $${paramCount}`);
      values.push(parameters.time_value);
      paramCount++;
    } else if (parameters.time_unit === 'day') {
      const months = parameters.time_value / 30;
      conditions.push(`months_to_expiration <= $${paramCount}`);
      values.push(months);
      paramCount++;
    } else if (parameters.time_unit === 'year') {
      const months = parameters.time_value * 12;
      conditions.push(`months_to_expiration <= $${paramCount}`);
      values.push(months);
      paramCount++;
    }
  }

  // Handle state filter
  if (parameters.state) {
    conditions.push(`state = $${paramCount}`);
    values.push(parameters.state.toUpperCase());
    paramCount++;
  }

  // Handle property name filter
  if (parameters.property_name) {
    conditions.push(`property_name ILIKE $${paramCount}`);
    values.push(`%${parameters.property_name}%`);
    paramCount++;
  }

  // Handle tenant name filter
  if (parameters.tenant_name) {
    conditions.push(`tenant_name ILIKE $${paramCount}`);
    values.push(`%${parameters.tenant_name}%`);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const sql = `
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
    ORDER BY expiration_date ASC
    LIMIT $${paramCount}
  `;

  values.push(DEFAULT_LIMIT);

  return {
    sql: sql.trim(),
    values,
    view: 'vw_expirations',
    description: buildQueryDescription(intent)
  };
}

/**
 * Generate SQL for rent roll queries
 */
function generateRentRollSQL(intent) {
  const { parameters } = intent;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  // Handle property name filter
  if (parameters.property_name) {
    conditions.push(`property_name ILIKE $${paramCount}`);
    values.push(`%${parameters.property_name}%`);
    paramCount++;
  }

  // Handle tenant name filter
  if (parameters.tenant_name) {
    conditions.push(`tenant_name ILIKE $${paramCount}`);
    values.push(`%${parameters.tenant_name}%`);
    paramCount++;
  }

  // Handle amount threshold
  if (parameters.amount_threshold) {
    const amount = parseFloat(parameters.amount_threshold);
    if (!isNaN(amount)) {
      conditions.push(`amount >= $${paramCount}`);
      values.push(amount);
      paramCount++;
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const sql = `
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
    LIMIT $${paramCount}
  `;

  values.push(DEFAULT_LIMIT);

  return {
    sql: sql.trim(),
    values,
    view: 'vw_rent_roll_current',
    description: buildQueryDescription(intent)
  };
}

/**
 * Generate SQL for options queries
 */
function generateOptionsSQL(intent) {
  const { parameters } = intent;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  // Handle option type filter
  if (parameters.option_type) {
    conditions.push(`option_type = $${paramCount}`);
    values.push(parameters.option_type.toUpperCase());
    paramCount++;
  }

  // Handle window status filter
  if (parameters.window_status) {
    if (parameters.window_status.toLowerCase() === 'open') {
      conditions.push(`notice_window_open = TRUE`);
    } else if (parameters.window_status.toLowerCase() === 'closed') {
      conditions.push(`notice_window_open = FALSE`);
    }
  }

  // Handle property name filter
  if (parameters.property_name) {
    conditions.push(`property_name ILIKE $${paramCount}`);
    values.push(`%${parameters.property_name}%`);
    paramCount++;
  }

  // Handle tenant name filter
  if (parameters.tenant_name) {
    conditions.push(`tenant_name ILIKE $${paramCount}`);
    values.push(`%${parameters.tenant_name}%`);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const sql = `
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
    LIMIT $${paramCount}
  `;

  values.push(DEFAULT_LIMIT);

  return {
    sql: sql.trim(),
    values,
    view: 'vw_options_status',
    description: buildQueryDescription(intent)
  };
}

/**
 * Generate SQL for financial queries (TI allowances or free rent)
 */
function generateFinancialSQL(intent) {
  const { parameters, originalQuery } = intent;
  const lowerQuery = originalQuery.toLowerCase();

  // Determine if query is about TI allowances or free rent
  if (lowerQuery.includes('ti') || lowerQuery.includes('tenant improvement') || lowerQuery.includes('allowance')) {
    return generateTIAllowanceSQL(intent);
  } else if (lowerQuery.includes('free rent') || lowerQuery.includes('concession')) {
    return generateFreeRentSQL(intent);
  }

  // Default to TI allowances
  return generateTIAllowanceSQL(intent);
}

/**
 * Generate SQL for TI allowance queries
 */
function generateTIAllowanceSQL(intent) {
  const { parameters } = intent;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  // Handle property name filter
  if (parameters.property_name) {
    conditions.push(`property_name ILIKE $${paramCount}`);
    values.push(`%${parameters.property_name}%`);
    paramCount++;
  }

  // Handle tenant name filter
  if (parameters.tenant_name) {
    conditions.push(`tenant_name ILIKE $${paramCount}`);
    values.push(`%${parameters.tenant_name}%`);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const sql = `
    SELECT 
      lease_id,
      master_lease_num,
      tenant_name,
      property_name,
      ROUND(total_ti_amount::numeric, 2) as total_ti_amount
    FROM vw_ti_allowance_summary
    ${whereClause}
    ORDER BY total_ti_amount DESC
    LIMIT $${paramCount}
  `;

  values.push(DEFAULT_LIMIT);

  return {
    sql: sql.trim(),
    values,
    view: 'vw_ti_allowance_summary',
    description: buildQueryDescription(intent)
  };
}

/**
 * Generate SQL for free rent queries
 */
function generateFreeRentSQL(intent) {
  const { parameters } = intent;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  // Handle property name filter
  if (parameters.property_name) {
    conditions.push(`property_name ILIKE $${paramCount}`);
    values.push(`%${parameters.property_name}%`);
    paramCount++;
  }

  // Handle tenant name filter
  if (parameters.tenant_name) {
    conditions.push(`tenant_name ILIKE $${paramCount}`);
    values.push(`%${parameters.tenant_name}%`);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const sql = `
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
    ${whereClause}
    ORDER BY free_rent_end
    LIMIT $${paramCount}
  `;

  values.push(DEFAULT_LIMIT);

  return {
    sql: sql.trim(),
    values,
    view: 'vw_free_rent_status',
    description: buildQueryDescription(intent)
  };
}

/**
 * Generate SQL for critical dates queries
 */
function generateCriticalDatesSQL(intent) {
  const { parameters } = intent;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  // Handle time period (default to 180 days)
  let daysAhead = 180;
  if (parameters.time_value && parameters.time_unit) {
    if (parameters.time_unit === 'day') {
      daysAhead = parameters.time_value;
    } else if (parameters.time_unit === 'month') {
      daysAhead = parameters.time_value * 30;
    } else if (parameters.time_unit === 'year') {
      daysAhead = parameters.time_value * 365;
    }
  }

  conditions.push(`date_value BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${daysAhead} days'`);

  // Handle property name filter
  if (parameters.property_name) {
    conditions.push(`property_name ILIKE $${paramCount}`);
    values.push(`%${parameters.property_name}%`);
    paramCount++;
  }

  // Handle tenant name filter
  if (parameters.tenant_name) {
    conditions.push(`tenant_name ILIKE $${paramCount}`);
    values.push(`%${parameters.tenant_name}%`);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const sql = `
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
    LIMIT $${paramCount}
  `;

  values.push(DEFAULT_LIMIT);

  return {
    sql: sql.trim(),
    values,
    view: 'vw_critical_dates_upcoming',
    description: buildQueryDescription(intent)
  };
}

/**
 * Generate SQL for amendment history queries
 */
function generateAmendmentsSQL(intent) {
  const { parameters } = intent;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  // Handle property name filter (via lease join)
  if (parameters.property_name) {
    conditions.push(`lease_id IN (
      SELECT l.lease_id 
      FROM lease l 
      INNER JOIN property p ON l.property_id = p.property_id 
      WHERE p.name ILIKE $${paramCount}
    )`);
    values.push(`%${parameters.property_name}%`);
    paramCount++;
  }

  // Handle tenant name filter (via lease join)
  if (parameters.tenant_name) {
    conditions.push(`lease_id IN (
      SELECT l.lease_id 
      FROM lease l 
      INNER JOIN party t ON l.tenant_id = t.party_id 
      WHERE t.legal_name ILIKE $${paramCount}
    )`);
    values.push(`%${parameters.tenant_name}%`);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const sql = `
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
    LIMIT $${paramCount}
  `;

  values.push(DEFAULT_LIMIT);

  return {
    sql: sql.trim(),
    values,
    view: 'vw_amendment_history',
    description: buildQueryDescription(intent)
  };
}

/**
 * Generate SQL for OpEx queries
 */
function generateOpExSQL(intent) {
  const { parameters } = intent;
  const conditions = [];
  const values = [];
  let paramCount = 1;

  // Handle property name filter
  if (parameters.property_name) {
    conditions.push(`property_name ILIKE $${paramCount}`);
    values.push(`%${parameters.property_name}%`);
    paramCount++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const sql = `
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
    LIMIT $${paramCount}
  `;

  values.push(DEFAULT_LIMIT);

  return {
    sql: sql.trim(),
    values,
    view: 'vw_opex_summary',
    description: buildQueryDescription(intent)
  };
}

/**
 * Build human-readable query description
 */
function buildQueryDescription(intent) {
  const { intent: category, parameters, originalQuery } = intent;
  
  let description = `Query: ${originalQuery}\n`;
  description += `Intent: ${category}\n`;
  
  if (Object.keys(parameters).length > 0) {
    description += `Filters: ${JSON.stringify(parameters, null, 2)}`;
  }
  
  return description;
}

/**
 * Validate SQL query for security
 * Ensures only whitelisted views are accessed
 */
function validateSQL(sqlQuery) {
  const lowerSQL = sqlQuery.toLowerCase();
  
  // Check for dangerous keywords
  const dangerousKeywords = ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate', 'exec', 'execute'];
  for (const keyword of dangerousKeywords) {
    if (lowerSQL.includes(keyword)) {
      return {
        valid: false,
        error: 'Query contains disallowed operations'
      };
    }
  }
  
  // Check that query only accesses whitelisted views
  const allAllowedViews = Object.values(ALLOWED_PATTERNS).flat();
  const accessesAllowedView = allAllowedViews.some(view => lowerSQL.includes(view));
  
  if (!accessesAllowedView) {
    return {
      valid: false,
      error: 'Query accesses non-whitelisted tables or views'
    };
  }
  
  return { valid: true };
}

module.exports = {
  generateSQL,
  validateSQL,
  ALLOWED_PATTERNS,
  MAX_LIMIT,
  DEFAULT_LIMIT
};
