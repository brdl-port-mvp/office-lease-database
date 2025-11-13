const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Client } = require('pg');

let dbClient = null;

async function getDBClient() {
  if (dbClient) return dbClient;

  const secretsManager = new SecretsManagerClient();
  const secretResponse = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
  );
  
  const secret = JSON.parse(secretResponse.SecretString);
  
  dbClient = new Client({
    host: secret.host,
    port: secret.port,
    database: process.env.DB_NAME,
    user: secret.username,
    password: secret.password
  });
  
  await dbClient.connect();
  return dbClient;
}

exports.handler = async (event) => {
  const { httpMethod, path, pathParameters, body } = event;
  
  try {
    const client = await getDBClient();
    
    // Route handling
    if (path.startsWith('/leases')) {
      if (httpMethod === 'GET' && pathParameters?.leaseId) {
        return await getLease(client, pathParameters.leaseId);
      } else if (httpMethod === 'GET') {
        return await getLeases(client, event.queryStringParameters);
      } else if (httpMethod === 'POST') {
        return await createLease(client, JSON.parse(body));
      } else if (httpMethod === 'PUT' && pathParameters?.leaseId) {
        return await updateLease(client, pathParameters.leaseId, JSON.parse(body));
      } else if (httpMethod === 'DELETE' && pathParameters?.leaseId) {
        return await deleteLease(client, pathParameters.leaseId);
      }
    } else if (path.startsWith('/properties')) {
      if (httpMethod === 'GET') {
        return await getProperties(client);
      } else if (httpMethod === 'POST') {
        return await createProperty(client, JSON.parse(body));
      }
    }
    
    return response(404, { message: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return response(500, { error: error.message });
  }
};

async function getLeases(client, queryParams = {}) {
  const { status, property_id } = queryParams;
  let query = 'SELECT * FROM leases WHERE 1=1';
  const params = [];
  
  if (status) {
    params.push(status);
    query += ` AND lease_status = $${params.length}`;
  }
  if (property_id) {
    params.push(property_id);
    query += ` AND property_id = $${params.length}`;
  }
  
  const result = await client.query(query, params);
  return response(200, result.rows);
}

async function getLease(client, leaseId) {
  const result = await client.query('SELECT * FROM leases WHERE lease_id = $1', [leaseId]);
  if (result.rows.length === 0) {
    return response(404, { message: 'Lease not found' });
  }
  return response(200, result.rows[0]);
}

async function createLease(client, data) {
  const query = `
    INSERT INTO leases (property_id, tenant_name, lease_start_date, lease_end_date, 
                        lease_term_months, square_feet, monthly_rent, annual_rent, 
                        security_deposit, lease_status, renewal_option)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;
  
  const values = [
    data.property_id, data.tenant_name, data.lease_start_date, data.lease_end_date,
    data.lease_term_months, data.square_feet, data.monthly_rent, data.annual_rent,
    data.security_deposit, data.lease_status || 'active', data.renewal_option || false
  ];
  
  const result = await client.query(query, values);
  return response(201, result.rows[0]);
}

async function updateLease(client, leaseId, data) {
  const result = await client.query('SELECT * FROM leases WHERE lease_id = $1', [leaseId]);
  if (result.rows.length === 0) {
    return response(404, { message: 'Lease not found' });
  }
  
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  Object.keys(data).forEach(key => {
    if (data[key] !== undefined) {
      updates.push(`${key} = $${paramCount}`);
      values.push(data[key]);
      paramCount++;
    }
  });
  
  values.push(leaseId);
  const query = `UPDATE leases SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP 
                 WHERE lease_id = $${paramCount} RETURNING *`;
  
  const updateResult = await client.query(query, values);
  return response(200, updateResult.rows[0]);
}

async function deleteLease(client, leaseId) {
  const result = await client.query('DELETE FROM leases WHERE lease_id = $1 RETURNING *', [leaseId]);
  if (result.rows.length === 0) {
    return response(404, { message: 'Lease not found' });
  }
  return response(200, { message: 'Lease deleted successfully' });
}

async function getProperties(client) {
  const result = await client.query('SELECT * FROM properties');
  return response(200, result.rows);
}

async function createProperty(client, data) {
  const query = `
    INSERT INTO properties (property_name, address, city, state, zip_code, 
                           country, total_square_feet, building_class)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  
  const values = [
    data.property_name, data.address, data.city, data.state, data.zip_code,
    data.country || 'USA', data.total_square_feet, data.building_class
  ];
  
  const result = await client.query(query, values);
  return response(201, result.rows[0]);
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  };
}
