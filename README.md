# Office Lease Database

AWS-based commercial lease management system with PostgreSQL, Lambda functions, and REST API.

## 🎯 Project Overview

A comprehensive database and API system for managing commercial office leases, including properties, tenants, lease agreements, rent schedules, options, and concessions.

### Key Features

- **Property & Suite Management** - Track buildings and individual suites
- **Lease Tracking** - Manage lease agreements with version history
- **Financial Management** - Rent schedules, OpEx pass-throughs, concessions
- **Reporting** - 8 pre-built reports (expirations, rent roll, options, etc.)
- **Natural Language Queries** - AI-powered query interface
- **Batch Operations** - Bulk create/update operations
- **Role-Based Access Control** - Multiple permission levels

## 🏗️ Architecture

### Infrastructure
- **Database**: Aurora PostgreSQL Serverless v2 (auto-scaling 0.5-4 ACUs)
- **API**: AWS Lambda functions with API Gateway
- **Network**: VPC with private subnets and NAT Gateway
- **Security**: IAM authentication, encryption at rest and in transit
- **Monitoring**: CloudWatch dashboards and alarms

### Tech Stack
- **Backend**: Node.js (Lambda functions)
- **Database**: PostgreSQL 15.13
- **Infrastructure**: AWS CDK (TypeScript)
- **Testing**: Jest
- **Migrations**: Flyway

## 📁 Project Structure

```
office-lease-database/
├── api/                          # API documentation
│   ├── API-DOCUMENTATION.md
│   └── examples.md
├── infrastructure/               # AWS CDK infrastructure code
│   ├── app.ts                   # CDK app entry point
│   ├── lease-database-stack.ts  # Main stack definition
│   ├── deploy.sh                # Deployment script
│   ├── DEPLOYMENT-RUNBOOK.md    # Step-by-step deployment guide
│   └── README.md                # Infrastructure documentation
├── lambda/api/                   # Lambda function code
│   ├── properties.js            # Property CRUD operations
│   ├── suites.js                # Suite CRUD operations
│   ├── parties.js               # Tenant/landlord management
│   ├── leases.js                # Lease management
│   ├── rent-schedules.js        # Rent period tracking
│   ├── opex-pass-throughs.js    # OpEx configurations
│   ├── options.js               # Lease options (renewal, termination)
│   ├── concessions.js           # TI allowances, free rent
│   ├── critical-dates.js        # Important dates tracking
│   ├── doc-links.js             # Document references
│   ├── reports.js               # Reporting endpoints
│   ├── batch.js                 # Batch operations
│   ├── nlq.js                   # Natural language queries
│   ├── authorizer.js            # IAM authorization
│   ├── db/                      # Database utilities
│   │   ├── connection.js        # Connection pooling
│   │   ├── errors.js            # Error handling
│   │   ├── logger.js            # Structured logging
│   │   └── authorization.js     # RBAC logic
│   └── tests/                   # Integration tests
│       ├── integration.test.js
│       ├── unit.test.js
│       └── README.md
├── schema/                       # Database schema
│   ├── migrations/              # Flyway migrations
│   │   ├── V001__create_core_tables.sql
│   │   ├── V002__create_lease_detail_tables.sql
│   │   ├── V003__create_option_concession_date_doc_tables.sql
│   │   ├── V004__create_indexes.sql
│   │   └── V005__create_views.sql
│   ├── seed-data.js             # Sample data generator
│   └── run-migrations.sh        # Migration runner
└── .kiro/specs/                 # Project specifications
    └── office-lease-database/
        ├── requirements.md      # Detailed requirements
        ├── design.md            # System design
        └── tasks.md             # Implementation tasks

```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- AWS CLI configured
- AWS CDK CLI (`npm install -g aws-cdk`)
- PostgreSQL client (for migrations)

### Deployment

1. **Clone the repository**
   ```bash
   git clone https://github.com/brdl-port-mvp/office-lease-database.git
   cd office-lease-database
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Bootstrap CDK** (first time only)
   ```bash
   cdk bootstrap aws://YOUR-ACCOUNT-ID/us-east-1
   ```

4. **Deploy infrastructure**
   ```bash
   cdk deploy --require-approval never
   ```

5. **Run database migrations**
   ```bash
   cd schema
   ./run-migrations.sh
   ```

6. **Load sample data** (optional)
   ```bash
   node seed-data.js
   ```

### Testing

```bash
cd lambda/api
npm install
npm test
```

## 📊 Database Schema

### Core Tables
- **property** - Buildings and properties
- **suite** - Individual suites within properties
- **party** - Tenants, landlords, guarantors
- **lease** - Master lease agreements
- **lease_version** - Lease amendments and versions

### Detail Tables
- **rent_schedule** - Base rent periods
- **opex_pass_through** - Operating expense configurations
- **option** - Renewal, termination, expansion options
- **concession** - TI allowances, free rent
- **critical_date** - Important milestone dates
- **doc_link** - Document references

### Views
- **vw_current_lease** - Current lease versions
- **vw_expirations** - Upcoming lease expirations
- **vw_rent_roll_current** - Current rent roll
- **vw_options_status** - Option exercise windows
- **vw_free_rent_status** - Active free rent periods
- **vw_ti_allowance_summary** - TI allowance totals
- **vw_critical_dates_upcoming** - Upcoming critical dates
- **vw_amendment_history** - Lease version history
- **vw_opex_summary** - OpEx configurations

## 🔌 API Endpoints

### Properties & Suites
- `GET /properties` - List properties
- `POST /properties` - Create property
- `GET /properties/{id}` - Get property details
- `PUT /properties/{id}` - Update property
- `DELETE /properties/{id}` - Delete property
- Similar endpoints for `/suites`

### Leases
- `GET /leases` - List leases
- `POST /leases` - Create lease with initial version
- `GET /leases/{id}` - Get lease details
- `POST /leases/{id}/versions` - Create amendment
- `PUT /leases/{id}` - Update lease

### Reports
- `GET /reports/expirations` - Expiration pipeline
- `GET /reports/rent-roll` - Current rent roll
- `GET /reports/options` - Options status
- `GET /reports/free-rent` - Free rent status
- `GET /reports/ti-allowances` - TI allowance summary
- `GET /reports/critical-dates` - Upcoming dates
- `GET /reports/amendments` - Amendment history
- `GET /reports/opex-summary` - OpEx summary

### Batch Operations
- `POST /batch/properties` - Bulk create/update properties
- `POST /batch/parties` - Bulk create/update parties
- `POST /batch/leases` - Bulk create/update leases

### Natural Language
- `POST /query/natural-language` - AI-powered queries

## 🔐 Security

### Authentication
- IAM-based authentication via API Gateway
- Lambda authorizer validates requests

### Authorization Roles
- **analyst_ro** - Read-only access to all data
- **lease_app_rw** - Full CRUD access
- **admin_dba** - Database administration

### Encryption
- Data at rest: KMS encryption
- Data in transit: TLS 1.2+
- Database credentials: AWS Secrets Manager

## 📈 Monitoring

### CloudWatch Dashboards
- API metrics (requests, latency, errors)
- Database metrics (CPU, connections, IOPS)

### Alarms
- API error rate > 5%
- Database CPU > 80%
- Lambda errors > 10 in 5 minutes
- Database connections > 90% of max

## 💰 Cost Estimate

**Development Environment**: ~$30-50/month
- Aurora Serverless v2: $20-30/month
- NAT Gateway: $33/month
- Lambda: $5-10/month
- Other services: $5-10/month

**Production Environment**: ~$100-300/month
- Aurora Serverless v2: $50-200/month
- NAT Gateway: $33/month
- Lambda: $20-50/month
- Other services: $10-20/month

## 📚 Documentation

- **[API Documentation](api/API-DOCUMENTATION.md)** - Complete API reference
- **[Deployment Runbook](infrastructure/DEPLOYMENT-RUNBOOK.md)** - Step-by-step deployment
- **[Infrastructure Guide](infrastructure/README.md)** - AWS infrastructure details
- **[Testing Guide](lambda/api/tests/README.md)** - Running tests
- **[Requirements](/.kiro/specs/office-lease-database/requirements.md)** - Detailed requirements
- **[Design Document](/.kiro/specs/office-lease-database/design.md)** - System design

## 🛠️ Development

### Running Locally

The Lambda functions can be tested locally:

```bash
cd lambda/api
npm install
node -e "require('./properties').handler({httpMethod:'GET',path:'/properties'}).then(console.log)"
```

### Adding New Endpoints

1. Create new Lambda function in `lambda/api/`
2. Add route in CDK stack (`infrastructure/lease-database-stack.ts`)
3. Add tests in `lambda/api/tests/`
4. Update API documentation

### Database Migrations

```bash
cd schema/migrations
# Create new migration
touch V006__your_migration_name.sql
# Run migrations
cd ..
./run-migrations.sh
```

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Add tests
4. Update documentation
5. Submit pull request

## 📝 License

Proprietary - All rights reserved

## 🆘 Support

For issues or questions:
1. Check the documentation in `/infrastructure/DEPLOYMENT-RUNBOOK.md`
2. Review CloudWatch logs
3. Check database connection settings
4. Verify IAM permissions

## 🎯 Current Status

✅ **Completed:**
- Database schema and migrations
- AWS infrastructure (CDK)
- All API endpoints (13 handlers)
- 8 reporting endpoints
- Batch operations
- Natural language queries
- Authentication & authorization
- Error handling & logging
- Monitoring & alerting
- Deployment scripts
- Integration tests
- Complete documentation

🚀 **Deployed:**
- Aurora PostgreSQL database cluster
- VPC and networking
- Basic infrastructure

📋 **Next Steps:**
- Add Lambda functions to CDK stack
- Deploy API Gateway
- Load production data
- Set up CI/CD pipeline

---

**Built with AWS CDK, Lambda, and PostgreSQL**
