# How to Upload Your CSV Data - Simple Guide

## Option 1: Use AWS CloudShell (EASIEST - No Installation Needed!)

AWS CloudShell has everything pre-installed. This is the fastest way.

### Steps:

1. **Open AWS CloudShell**
   - Go to https://console.aws.amazon.com/
   - Click the CloudShell icon (>_) in the top right corner
   - Wait for it to load

2. **Upload your CSV file**
   - In CloudShell, click **Actions** → **Upload file**
   - Select your CSV file (e.g., `my-lease-data.csv`)
   - Wait for upload to complete

3. **Upload this script**
   - Click **Actions** → **Upload file** again
   - Select `upload-data-cloudshell.sh` from your project folder

4. **Run the upload**
   ```bash
   chmod +x upload-data-cloudshell.sh
   ./upload-data-cloudshell.sh my-lease-data.csv
   ```

That's it! The script will:
- ✓ Connect to your database
- ✓ Convert your CSV to SQL
- ✓ Upload everything
- ✓ Show you a summary

---

## Option 2: Install Node.js on Windows (If you want to run locally)

### Step 1: Install Node.js
1. Go to https://nodejs.org/
2. Download the **LTS version** (green button)
3. Run the installer
4. Click "Next" through all the steps
5. **Restart your computer** (important!)

### Step 2: Verify Installation
Open PowerShell and type:
```powershell
node --version
```
You should see something like `v20.11.0`

### Step 3: Navigate to Your Project
```powershell
cd "C:\Users\benja\OneDrive\Ben Portfolio\AI Projects\AWS Kiro"
```

### Step 4: Install Dependencies
```powershell
npm install csv-parse
```

### Step 5: Upload Your Data
```powershell
node schema/import-csv-data.js your-lease-data.csv > import-data.sql
```

This creates a SQL file. Then you need to load it into the database (requires psql).

---

## What Your CSV Should Look Like

Your CSV can have any of these column names (the script is flexible):

### Required Columns:
- **Property**: `property_name`, `property`, or `building`
- **Tenant**: `tenant`, `tenant_name`
- **Landlord**: `landlord`, `landlord_name`

### Optional but Recommended:
- **Location**: `address`, `city`, `state`, `postal_code`, `zip`
- **Suite**: `suite`, `suite_number`, `unit`
- **Size**: `rsf`, `square_feet`, `size`
- **Dates**: `start_date`, `end_date`, `commencement_date`, `expiration_date`
- **Rent**: `monthly_rent`, `rent`, `base_rent`
- **Lease Info**: `lease_number`, `lease_id`, `term_months`

### Example CSV:
```csv
property_name,city,state,tenant,landlord,suite,rsf,start_date,end_date,monthly_rent
Downtown Tower,New York,NY,Acme Corp,ABC Properties,1001,5000,2023-01-01,2028-01-01,25000
Midtown Plaza,New York,NY,Tech Inc,XYZ Realty,2050,8000,2022-06-01,2027-06-01,40000
```

---

## Troubleshooting

### "Cannot connect to database"
Your database is in a private subnet. The CloudShell script will automatically fix this by opening the security group.

### "File not found"
Make sure you're in the right directory:
```powershell
cd "C:\Users\benja\OneDrive\Ben Portfolio\AI Projects\AWS Kiro"
```

### "Stack not found"
Make sure your database is deployed first:
```bash
cd infrastructure
./deploy.sh
```

---

## My Recommendation

**Use AWS CloudShell** (Option 1). It's the easiest because:
- ✓ No installation needed
- ✓ Everything pre-configured
- ✓ Direct access to your AWS resources
- ✓ Works from any computer

Just upload your CSV and the script, then run one command!
