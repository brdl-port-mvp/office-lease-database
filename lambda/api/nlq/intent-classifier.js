/**
 * Intent Classifier Module
 * Uses AWS Bedrock to classify natural language queries into structured intents
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Intent categories
const INTENT_CATEGORIES = {
  EXPIRATION: 'expiration',
  RENT_ROLL: 'rent_roll',
  OPTIONS: 'options',
  FINANCIAL: 'financial',
  CRITICAL_DATES: 'critical_dates',
  AMENDMENTS: 'amendments',
  OPEX: 'opex',
  UNKNOWN: 'unknown'
};

// Initialize Bedrock client
let bedrockClient = null;

function getBedrockClient() {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
  }
  return bedrockClient;
}

/**
 * Classify a natural language query into an intent
 * @param {string} query - Natural language query from user
 * @returns {Promise<Object>} Intent object with category, confidence, and extracted parameters
 */
async function classifyIntent(query) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      intent: INTENT_CATEGORIES.UNKNOWN,
      confidence: 0,
      parameters: {},
      error: 'Empty or invalid query'
    };
  }

  try {
    const client = getBedrockClient();
    
    // Construct prompt for intent classification
    const prompt = buildClassificationPrompt(query);
    
    // Use Claude 3 Haiku for fast, cost-effective classification
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
    
    const requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1000,
      temperature: 0.1, // Low temperature for consistent classification
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Parse the response
    const result = parseClassificationResponse(responseBody.content[0].text, query);
    
    return result;
    
  } catch (error) {
    console.error('Intent classification error:', error);
    
    // Fallback to rule-based classification
    return fallbackClassification(query);
  }
}

/**
 * Build classification prompt for Bedrock
 */
function buildClassificationPrompt(query) {
  return `You are a lease database query classifier. Analyze the following natural language query and classify it into one of these categories:

Categories:
- expiration: Queries about lease expiration dates, expirations pipeline, leases ending soon
- rent_roll: Queries about current rent, rent amounts, monthly/annual rent
- options: Queries about renewal options, termination options, expansion rights, ROFR
- financial: Queries about TI allowances, free rent, concessions, financial summaries
- critical_dates: Queries about important dates, deadlines, commencement dates, notice dates
- amendments: Queries about lease amendments, version history, changes to leases
- opex: Queries about operating expenses, OpEx pass-through, expense recovery
- unknown: Queries that don't fit the above categories

Extract these parameters if present:
- date_range: Any date ranges mentioned (e.g., "next 6 months", "this year", "Q1 2024")
- property_name: Property or building names
- tenant_name: Tenant or company names
- state: US state abbreviations or names
- option_type: Type of option (renewal, termination, expansion, ROFR)
- amount_threshold: Dollar amounts or thresholds
- time_period: Specific time periods (months, days, years)

Query: "${query}"

Respond ONLY with valid JSON in this exact format:
{
  "intent": "category_name",
  "confidence": 0.95,
  "parameters": {
    "date_range": "6 months",
    "property_name": "Building A",
    "tenant_name": "Acme Corp"
  },
  "reasoning": "Brief explanation"
}`;
}

/**
 * Parse Bedrock response into structured intent
 */
function parseClassificationResponse(responseText, originalQuery) {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = responseText.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '');
    }
    
    const parsed = JSON.parse(jsonText);
    
    // Validate intent category
    const intent = Object.values(INTENT_CATEGORIES).includes(parsed.intent) 
      ? parsed.intent 
      : INTENT_CATEGORIES.UNKNOWN;
    
    // Ensure confidence is between 0 and 1
    const confidence = Math.max(0, Math.min(1, parsed.confidence || 0));
    
    return {
      intent,
      confidence,
      parameters: parsed.parameters || {},
      reasoning: parsed.reasoning || '',
      originalQuery
    };
    
  } catch (error) {
    console.error('Failed to parse classification response:', error);
    console.error('Response text:', responseText);
    
    // Fallback to rule-based classification
    return fallbackClassification(originalQuery);
  }
}

/**
 * Fallback rule-based classification when Bedrock is unavailable
 */
function fallbackClassification(query) {
  const lowerQuery = query.toLowerCase();
  
  // Expiration patterns
  if (lowerQuery.match(/expir(e|ing|ation)|ending|end(s)? (soon|in)|lease(s)? (ending|expiring)/)) {
    return {
      intent: INTENT_CATEGORIES.EXPIRATION,
      confidence: 0.7,
      parameters: extractDateRange(query),
      reasoning: 'Rule-based: matched expiration keywords',
      originalQuery: query
    };
  }
  
  // Rent roll patterns
  if (lowerQuery.match(/rent roll|current rent|monthly rent|annual rent|rent amount/)) {
    return {
      intent: INTENT_CATEGORIES.RENT_ROLL,
      confidence: 0.7,
      parameters: extractPropertyAndTenant(query),
      reasoning: 'Rule-based: matched rent roll keywords',
      originalQuery: query
    };
  }
  
  // Options patterns
  if (lowerQuery.match(/option(s)?|renewal|termination|expansion|rofr|right of first refusal|notice window/)) {
    return {
      intent: INTENT_CATEGORIES.OPTIONS,
      confidence: 0.7,
      parameters: extractOptionType(query),
      reasoning: 'Rule-based: matched options keywords',
      originalQuery: query
    };
  }
  
  // Financial patterns
  if (lowerQuery.match(/ti allowance|tenant improvement|free rent|concession/)) {
    return {
      intent: INTENT_CATEGORIES.FINANCIAL,
      confidence: 0.7,
      parameters: extractPropertyAndTenant(query),
      reasoning: 'Rule-based: matched financial keywords',
      originalQuery: query
    };
  }
  
  // Critical dates patterns
  if (lowerQuery.match(/critical date|important date|deadline|commencement|notice date/)) {
    return {
      intent: INTENT_CATEGORIES.CRITICAL_DATES,
      confidence: 0.7,
      parameters: extractDateRange(query),
      reasoning: 'Rule-based: matched critical dates keywords',
      originalQuery: query
    };
  }
  
  // Amendment patterns
  if (lowerQuery.match(/amendment|version|history|change(s)?|modification/)) {
    return {
      intent: INTENT_CATEGORIES.AMENDMENTS,
      confidence: 0.7,
      parameters: extractPropertyAndTenant(query),
      reasoning: 'Rule-based: matched amendment keywords',
      originalQuery: query
    };
  }
  
  // OpEx patterns
  if (lowerQuery.match(/opex|operating expense|expense recovery|pass.?through|base year|expense stop|nnn|triple net/)) {
    return {
      intent: INTENT_CATEGORIES.OPEX,
      confidence: 0.7,
      parameters: extractPropertyAndTenant(query),
      reasoning: 'Rule-based: matched OpEx keywords',
      originalQuery: query
    };
  }
  
  return {
    intent: INTENT_CATEGORIES.UNKNOWN,
    confidence: 0.3,
    parameters: {},
    reasoning: 'Rule-based: no matching patterns found',
    originalQuery: query
  };
}

/**
 * Extract date range from query
 */
function extractDateRange(query) {
  const params = {};
  
  // Match "next X months/days/years"
  const nextMatch = query.match(/next\s+(\d+)\s+(month|day|year)s?/i);
  if (nextMatch) {
    params.time_period = `${nextMatch[1]} ${nextMatch[2]}s`;
    params.time_value = parseInt(nextMatch[1], 10);
    params.time_unit = nextMatch[2].toLowerCase();
  }
  
  // Match "in X months/days"
  const inMatch = query.match(/in\s+(\d+)\s+(month|day|year)s?/i);
  if (inMatch) {
    params.time_period = `${inMatch[1]} ${inMatch[2]}s`;
    params.time_value = parseInt(inMatch[1], 10);
    params.time_unit = inMatch[2].toLowerCase();
  }
  
  // Match "this year/month/quarter"
  if (query.match(/this\s+(year|month|quarter)/i)) {
    params.time_period = query.match(/this\s+(year|month|quarter)/i)[0];
  }
  
  return params;
}

/**
 * Extract property and tenant names from query
 */
function extractPropertyAndTenant(query) {
  const params = {};
  
  // Match property names (Building X, Property X, etc.)
  const propertyMatch = query.match(/(?:building|property)\s+([A-Z0-9][A-Za-z0-9\s]*?)(?:\s|$|,|\.|for|with)/i);
  if (propertyMatch) {
    params.property_name = propertyMatch[1].trim();
  }
  
  // Match tenant names (Tenant X, Company X, etc.)
  const tenantMatch = query.match(/(?:tenant|company)\s+([A-Z][A-Za-z0-9\s&]*?)(?:\s|$|,|\.|in|at)/i);
  if (tenantMatch) {
    params.tenant_name = tenantMatch[1].trim();
  }
  
  // Match state abbreviations
  const stateMatch = query.match(/\b([A-Z]{2})\b/);
  if (stateMatch) {
    params.state = stateMatch[1];
  }
  
  return params;
}

/**
 * Extract option type from query
 */
function extractOptionType(query) {
  const params = extractPropertyAndTenant(query);
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('renewal')) {
    params.option_type = 'RENEWAL';
  } else if (lowerQuery.includes('termination')) {
    params.option_type = 'TERMINATION';
  } else if (lowerQuery.includes('expansion')) {
    params.option_type = 'EXPANSION';
  } else if (lowerQuery.includes('rofr') || lowerQuery.includes('right of first refusal')) {
    params.option_type = 'ROFR';
  }
  
  // Check for window status
  if (lowerQuery.includes('open') || lowerQuery.includes('active')) {
    params.window_status = 'open';
  } else if (lowerQuery.includes('closed')) {
    params.window_status = 'closed';
  }
  
  return params;
}

module.exports = {
  classifyIntent,
  INTENT_CATEGORIES
};
