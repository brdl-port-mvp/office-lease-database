# Upload Your CSV Data to Aurora Database
# PowerShell script for Windows users

param(
    [Parameter(Mandatory=$true)]
    [string]$CsvFile
)

Write-Host "=========================================" -ForegroundColor Blue
Write-Host "Upload Your Lease Data" -ForegroundColor Blue
Write-Host "=========================================" -ForegroundColor Blue
Write-Host ""

# Check if file exists
if (-not (Test-Path $CsvFile)) {
    Write-Host "Error: File not found: $CsvFile" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Found CSV file: $CsvFile" -ForegroundColor Green
Write-Host ""

# Check Node.js
try {
    $null = node --version
    Write-Host "✓ Node.js found" -ForegroundColor Green
} catch {
    Write-Host "Error: Node.js is not installed" -ForegroundColor Red
    exit 1
}

# Install csv-parse if needed
Write-Host "Checking dependencies..." -ForegroundColor Blue
try {
    node -e "require('csv-parse/sync')" 2>$null
} catch {
    Write-Host "Installing csv-parse..." -ForegroundColor Yellow
    npm install csv-parse
}

# Get database connection details
Write-Host "Getting database connection..." -ForegroundColor Blue

$StackName = "OfficeLeaseDatabaseStack"
$Region = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

try {
    $DbEndpoint = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[?OutputKey==`DatabaseProxyEndpoint`].OutputValue' `
        --output text 2>$null

    $DbSecretArn = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' `
        --output text 2>$null

    $DbName = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[?OutputKey==`DatabaseName`].OutputValue' `
        --output text 2>$null

    if (-not $DbEndpoint) {
        Write-Host "Error: Could not find database. Is the stack deployed?" -ForegroundColor Red
        exit 1
    }

    Write-Host "✓ Database endpoint: $DbEndpoint" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "Error: Failed to get database details" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Get database credentials
Write-Host "Getting database credentials..." -ForegroundColor Blue
try {
    $DbCredsJson = aws secretsmanager get-secret-value `
        --secret-id $DbSecretArn `
        --region $Region `
        --query SecretString `
        --output text

    $DbCreds = $DbCredsJson | ConvertFrom-Json
    $DbUser = $DbCreds.username
    $DbPass = $DbCreds.password

    Write-Host "✓ Credentials retrieved" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "Error: Failed to get credentials" -ForegroundColor Red
    exit 1
}

# Convert CSV to SQL
Write-Host "Converting CSV to SQL..." -ForegroundColor Blue
$SqlFile = "schema/import-data.sql"

try {
    node schema/import-csv-data.js $CsvFile | Out-File -FilePath $SqlFile -Encoding UTF8

    if (-not (Test-Path $SqlFile) -or (Get-Item $SqlFile).Length -eq 0) {
        Write-Host "Error: Failed to generate SQL" -ForegroundColor Red
        exit 1
    }

    Write-Host "✓ SQL generated: $SqlFile" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "Error: Failed to convert CSV" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Show preview
Write-Host "Preview of data to be imported:" -ForegroundColor Blue
Get-Content $SqlFile -Head 30
Write-Host "..."
Write-Host ""

# Confirm
$confirmation = Read-Host "Ready to upload this data to the database? (y/n)"
if ($confirmation -ne 'y') {
    Write-Host "Upload cancelled" -ForegroundColor Yellow
    exit 0
}

# Load data
Write-Host ""
Write-Host "Uploading data to database..." -ForegroundColor Blue

$env:PGPASSWORD = $DbPass
try {
    psql -h $DbEndpoint -U $DbUser -d $DbName -f $SqlFile

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "=========================================" -ForegroundColor Green
        Write-Host "✓ Data uploaded successfully!" -ForegroundColor Green
        Write-Host "=========================================" -ForegroundColor Green
        Write-Host ""

        # Show summary
        Write-Host "Verifying data..." -ForegroundColor Blue
        psql -h $DbEndpoint -U $DbUser -d $DbName -c @"
SELECT 'Properties' as table_name, COUNT(*) as count FROM property
UNION ALL SELECT 'Parties', COUNT(*) FROM party
UNION ALL SELECT 'Suites', COUNT(*) FROM suite
UNION ALL SELECT 'Leases', COUNT(*) FROM lease
UNION ALL SELECT 'Lease Versions', COUNT(*) FROM lease_version
UNION ALL SELECT 'Rent Schedules', COUNT(*) FROM rent_schedule;
"@

        Write-Host ""
        Write-Host "Your data is now in the database!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "Error: Upload failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "Error: Upload failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    Remove-Item Env:\PGPASSWORD
}
