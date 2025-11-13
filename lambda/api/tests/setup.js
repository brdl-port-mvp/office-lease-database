/**
 * Test Setup and Configuration
 * Configures test environment and database connection
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'ERROR'; // Reduce log noise during tests
process.env.DB_SECRET_ARN = process.env.TEST_DB_SECRET_ARN || 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-db-secret';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'lease_db_test';
process.env.AWS_REGION = 'us-east-1';
process.env.DB_POOL_MAX = '5'; // Smaller pool for tests
process.env.DB_POOL_MIN = '1';

// Mock AWS SDK if needed
if (!process.env.TEST_DB_SECRET_ARN) {
  console.warn('TEST_DB_SECRET_ARN not set. Using mock credentials.');
  
  // Mock Secrets Manager for local testing
  jest.mock('@aws-sdk/client-secrets-manager', () => {
    return {
      SecretsManagerClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({
          SecretString: JSON.stringify({
            username: process.env.TEST_DB_USER || 'postgres',
            password: process.env.TEST_DB_PASSWORD || 'postgres',
            host: process.env.TEST_DB_HOST || 'localhost',
            port: process.env.TEST_DB_PORT || 5432
          })
        })
      }))
    };
  });
}

// Global test timeout
jest.setTimeout(30000);

console.log('Test environment configured');
console.log(`Database: ${process.env.DB_NAME}`);
console.log(`Region: ${process.env.AWS_REGION}`);
