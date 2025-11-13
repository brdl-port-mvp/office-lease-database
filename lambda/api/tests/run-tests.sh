#!/bin/bash

# Integration Test Runner Script
# Runs API integration tests with proper environment setup

set -e

echo "========================================="
echo "Office Lease Database API Integration Tests"
echo "========================================="
echo ""

# Check if PostgreSQL is running
echo "Checking PostgreSQL connection..."
if ! pg_isready -h ${TEST_DB_HOST:-localhost} -p ${TEST_DB_PORT:-5432} > /dev/null 2>&1; then
    echo "ERROR: PostgreSQL is not running or not accessible"
    echo "Please start PostgreSQL and ensure it's accessible at ${TEST_DB_HOST:-localhost}:${TEST_DB_PORT:-5432}"
    exit 1
fi
echo "✓ PostgreSQL is running"
echo ""

# Check if test database exists
echo "Checking test database..."
if ! psql -h ${TEST_DB_HOST:-localhost} -p ${TEST_DB_PORT:-5432} -U ${TEST_DB_USER:-postgres} -lqt | cut -d \| -f 1 | grep -qw ${TEST_DB_NAME:-lease_db_test}; then
    echo "WARNING: Test database '${TEST_DB_NAME:-lease_db_test}' does not exist"
    echo "Creating test database..."
    createdb -h ${TEST_DB_HOST:-localhost} -p ${TEST_DB_PORT:-5432} -U ${TEST_DB_USER:-postgres} ${TEST_DB_NAME:-lease_db_test}
    echo "✓ Test database created"
else
    echo "✓ Test database exists"
fi
echo ""

# Check if migrations are applied
echo "Checking database schema..."
TABLE_COUNT=$(psql -h ${TEST_DB_HOST:-localhost} -p ${TEST_DB_PORT:-5432} -U ${TEST_DB_USER:-postgres} -d ${TEST_DB_NAME:-lease_db_test} -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" -lt "10" ]; then
    echo "WARNING: Database schema appears incomplete (found $TABLE_COUNT tables)"
    echo "Please run migrations first:"
    echo "  cd ../../schema && ./run-migrations.sh"
    exit 1
fi
echo "✓ Database schema is ready ($TABLE_COUNT tables found)"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo "✓ Dependencies installed"
    echo ""
fi

# Run tests
echo "Running integration tests..."
echo ""

# Export environment variables for tests
export NODE_ENV=test
export TEST_DB_HOST=${TEST_DB_HOST:-localhost}
export TEST_DB_PORT=${TEST_DB_PORT:-5432}
export TEST_DB_USER=${TEST_DB_USER:-postgres}
export TEST_DB_PASSWORD=${TEST_DB_PASSWORD:-postgres}
export TEST_DB_NAME=${TEST_DB_NAME:-lease_db_test}

# Run Jest with coverage
npm test -- --coverage --verbose

echo ""
echo "========================================="
echo "Tests completed!"
echo "========================================="
echo ""
echo "Coverage report available at: coverage/index.html"
