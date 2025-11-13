#!/usr/bin/env node

/**
 * Test Verification Script
 * Verifies that test files are properly structured and dependencies are available
 */

const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('Test Suite Verification');
console.log('========================================\n');

let hasErrors = false;

// Check if test files exist
const testFiles = [
  'unit.test.js',
  'integration.test.js',
  'setup.js',
  'README.md',
  'TESTING-GUIDE.md'
];

console.log('Checking test files...');
testFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✓ ${file} exists`);
  } else {
    console.log(`✗ ${file} missing`);
    hasErrors = true;
  }
});
console.log('');

// Check if package.json has test scripts
console.log('Checking package.json configuration...');
const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (packageJson.scripts && packageJson.scripts.test) {
    console.log('✓ Test script configured');
  } else {
    console.log('✗ Test script not configured');
    hasErrors = true;
  }
  
  if (packageJson.devDependencies && packageJson.devDependencies.jest) {
    console.log('✓ Jest dependency configured');
  } else {
    console.log('✗ Jest dependency not configured');
    hasErrors = true;
  }
} else {
  console.log('✗ package.json not found');
  hasErrors = true;
}
console.log('');

// Check if jest.config.js exists
console.log('Checking Jest configuration...');
const jestConfigPath = path.join(__dirname, '..', 'jest.config.js');
if (fs.existsSync(jestConfigPath)) {
  console.log('✓ jest.config.js exists');
} else {
  console.log('✗ jest.config.js missing');
  hasErrors = true;
}
console.log('');

// Check if API handler files exist
console.log('Checking API handler files...');
const handlers = [
  'properties.js',
  'suites.js',
  'parties.js',
  'leases.js',
  'rent-schedules.js',
  'opex-pass-throughs.js',
  'options.js',
  'concessions.js',
  'critical-dates.js',
  'doc-links.js',
  'reports.js',
  'batch.js',
  'nlq.js'
];

handlers.forEach(handler => {
  const handlerPath = path.join(__dirname, '..', handler);
  if (fs.existsSync(handlerPath)) {
    console.log(`✓ ${handler} exists`);
  } else {
    console.log(`✗ ${handler} missing`);
    hasErrors = true;
  }
});
console.log('');

// Check if db module exists
console.log('Checking database module...');
const dbFiles = [
  'db/index.js',
  'db/connection.js',
  'db/errors.js',
  'db/logger.js',
  'db/authorization.js'
];

dbFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    console.log(`✓ ${file} exists`);
  } else {
    console.log(`✗ ${file} missing`);
    hasErrors = true;
  }
});
console.log('');

// Summary
console.log('========================================');
if (hasErrors) {
  console.log('❌ Verification FAILED - Some files are missing');
  console.log('========================================\n');
  process.exit(1);
} else {
  console.log('✅ Verification PASSED - All files present');
  console.log('========================================\n');
  console.log('Next steps:');
  console.log('1. Install dependencies: npm install');
  console.log('2. Setup test database: createdb lease_db_test');
  console.log('3. Run migrations: cd ../../schema && ./run-migrations.sh');
  console.log('4. Run tests: npm test');
  console.log('');
  process.exit(0);
}
