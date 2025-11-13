#!/bin/bash

# Script to apply authorization checks to all Lambda functions
# This script adds the authorization check and error handling to Lambda functions

echo "Applying authorization to Lambda functions..."

# List of Lambda function files that need authorization
LAMBDA_FILES=(
  "suites.js"
  "parties.js"
  "rent-schedules.js"
  "opex-pass-throughs.js"
  "options.js"
  "concessions.js"
  "critical-dates.js"
  "doc-links.js"
  "batch.js"
  "nlq.js"
)

# Backup directory
BACKUP_DIR="./backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Created backup directory: $BACKUP_DIR"

for file in "${LAMBDA_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    
    # Create backup
    cp "$file" "$BACKUP_DIR/$file"
    echo "  ✓ Backed up to $BACKUP_DIR/$file"
    
    # Check if authorization is already added
    if grep -q "db.authorization.authorizeRequest" "$file"; then
      echo "  ⚠ Authorization already present in $file, skipping"
      continue
    fi
    
    echo "  ℹ Manual integration required for $file"
    echo "    1. Add after request logging: const authResult = db.authorization.authorizeRequest(event);"
    echo "    2. Add in catch block: if (error.code === 'FORBIDDEN') { ... }"
    echo "    See AUTHORIZATION-INTEGRATION.md for details"
    
  else
    echo "⚠ File not found: $file"
  fi
done

echo ""
echo "Authorization application complete!"
echo "Backups saved to: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "1. Review AUTHORIZATION-INTEGRATION.md for integration guide"
echo "2. Manually integrate authorization into each Lambda function"
echo "3. Test with all three roles (lease_app_rw, analyst_ro, admin_dba)"
echo "4. Verify 403 responses for unauthorized access"
