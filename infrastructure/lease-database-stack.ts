import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export class LeaseDatabaseStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly dbCluster: rds.DatabaseCluster;
  public readonly dbProxy: rds.DatabaseProxy;
  public readonly dbSecret: secretsmanager.Secret;
  public readonly leaseAppRwRole: iam.Role;
  public readonly analystRoRole: iam.Role;
  public readonly adminDbaRole: iam.Role;
  public readonly httpApi: apigatewayv2.HttpApi;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // VPC with Private Subnets and Security Groups
    // ========================================
    this.vpc = new ec2.Vpc(this, 'LeaseVPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 28,
          name: 'Database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // Security group for Aurora cluster
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Aurora PostgreSQL cluster',
      allowAllOutbound: false,
    });

    // Security group for RDS Proxy
    const proxySecurityGroup = new ec2.SecurityGroup(this, 'ProxySecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for RDS Proxy',
      allowAllOutbound: true,
    });

    // Security group for Lambda functions
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Lambda functions accessing database',
      allowAllOutbound: true,
    });

    // Allow RDS Proxy to connect to Aurora
    dbSecurityGroup.addIngressRule(
      proxySecurityGroup,
      ec2.Port.tcp(5432),
      'Allow RDS Proxy to connect to Aurora'
    );

    // Allow Lambda to connect to RDS Proxy
    proxySecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to RDS Proxy'
    );

    // ========================================
    // KMS Key for Encryption
    // ========================================
    const kmsKey = new kms.Key(this, 'DatabaseEncryptionKey', {
      description: 'KMS key for Aurora cluster encryption',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Use RETAIN for production
    });

    // ========================================
    // Secrets Manager Secret with Rotation
    // ========================================
    this.dbSecret = new secretsmanager.Secret(this, 'DatabaseCredentials', {
      description: 'Database credentials for Aurora PostgreSQL cluster',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'dbadmin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
      encryptionKey: kmsKey,
    });

    // ========================================
    // Aurora PostgreSQL Serverless v2 Cluster
    // ========================================
    this.dbCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      defaultDatabaseName: 'officeLeaseDB',
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        autoMinorVersionUpgrade: true,
      }),
      readers: [
        rds.ClusterInstance.serverlessV2('Reader', {
          scaleWithWriter: true,
          autoMinorVersionUpgrade: true,
        }),
      ],
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      storageEncrypted: true,
      storageEncryptionKey: kmsKey,
      backup: {
        retention: cdk.Duration.days(7),
        preferredWindow: '03:00-04:00',
      },
      preferredMaintenanceWindow: 'sun:04:00-sun:05:00',
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      deletionProtection: false, // Set to true for production
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Use SNAPSHOT for production
    });

    // ========================================
    // RDS Proxy for Connection Pooling
    // ========================================
    this.dbProxy = new rds.DatabaseProxy(this, 'DatabaseProxy', {
      proxyTarget: rds.ProxyTarget.fromCluster(this.dbCluster),
      secrets: [this.dbSecret],
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [proxySecurityGroup],
      dbProxyName: 'office-lease-db-proxy',
      requireTLS: true,
      maxConnectionsPercent: 100,
      maxIdleConnectionsPercent: 50,
      debugLogging: false,
    });

    // ========================================
    // IAM Roles with Policies
    // ========================================

    // lease_app_rw: Full read-write access for application services
    this.leaseAppRwRole = new iam.Role(this, 'LeaseAppRwRole', {
      roleName: 'lease_app_rw',
      description: 'Service role with full CRUD access to lease database',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    this.leaseAppRwRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'rds-db:connect',
        ],
        resources: [
          `arn:aws:rds-db:${this.region}:${this.account}:dbuser:${this.dbProxy.dbProxyName}/*`,
        ],
      })
    );

    this.dbSecret.grantRead(this.leaseAppRwRole);
    kmsKey.grantDecrypt(this.leaseAppRwRole);

    // analyst_ro: Read-only access for analysts and BI tools
    this.analystRoRole = new iam.Role(this, 'AnalystRoRole', {
      roleName: 'analyst_ro',
      description: 'Read-only role for analysts and reporting',
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        new iam.AccountPrincipal(this.account), // Allow IAM users in account
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    this.analystRoRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'rds-db:connect',
        ],
        resources: [
          `arn:aws:rds-db:${this.region}:${this.account}:dbuser:${this.dbProxy.dbProxyName}/*`,
        ],
      })
    );

    this.dbSecret.grantRead(this.analystRoRole);
    kmsKey.grantDecrypt(this.analystRoRole);

    // admin_dba: Full administrative access including schema changes
    this.adminDbaRole = new iam.Role(this, 'AdminDbaRole', {
      roleName: 'admin_dba',
      description: 'Administrative role for database management and migrations',
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        new iam.AccountPrincipal(this.account), // Allow IAM users in account
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    this.adminDbaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'rds:*',
          'rds-db:connect',
        ],
        resources: [
          this.dbCluster.clusterArn,
          `arn:aws:rds-db:${this.region}:${this.account}:dbuser:${this.dbProxy.dbProxyName}/*`,
        ],
      })
    );

    this.dbSecret.grantRead(this.adminDbaRole);
    this.dbSecret.grantWrite(this.adminDbaRole);
    kmsKey.grantDecrypt(this.adminDbaRole);
    kmsKey.grantEncrypt(this.adminDbaRole);

    // ========================================
    // CloudWatch Log Groups and Metric Filters
    // ========================================

    // Log group for API Gateway (will be used when API Gateway is created)
    const apiLogGroup = new logs.LogGroup(this, 'ApiGatewayLogGroup', {
      logGroupName: '/aws/apigateway/office-lease-api',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Log group for Lambda functions
    const lambdaLogGroup = new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: '/aws/lambda/office-lease-api',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Metric filter for API errors (4xx responses)
    new logs.MetricFilter(this, 'ApiClientErrorMetric', {
      logGroup: apiLogGroup,
      metricNamespace: 'OfficeLease/API',
      metricName: 'ClientErrors',
      filterPattern: logs.FilterPattern.literal('[..., status_code=4*, ...]'),
      metricValue: '1',
      defaultValue: 0,
    });

    // Metric filter for API errors (5xx responses)
    new logs.MetricFilter(this, 'ApiServerErrorMetric', {
      logGroup: apiLogGroup,
      metricNamespace: 'OfficeLease/API',
      metricName: 'ServerErrors',
      filterPattern: logs.FilterPattern.literal('[..., status_code=5*, ...]'),
      metricValue: '1',
      defaultValue: 0,
    });

    // Metric filter for Lambda errors
    new logs.MetricFilter(this, 'LambdaErrorMetric', {
      logGroup: lambdaLogGroup,
      metricNamespace: 'OfficeLease/Lambda',
      metricName: 'Errors',
      filterPattern: logs.FilterPattern.literal('[..., level=ERROR, ...]'),
      metricValue: '1',
      defaultValue: 0,
    });

    // Metric filter for database connection errors
    new logs.MetricFilter(this, 'DatabaseConnectionErrorMetric', {
      logGroup: lambdaLogGroup,
      metricNamespace: 'OfficeLease/Database',
      metricName: 'ConnectionErrors',
      filterPattern: logs.FilterPattern.anyTerm('ECONNREFUSED', 'connection timeout', 'too many connections'),
      metricValue: '1',
      defaultValue: 0,
    });

    // ========================================
    // Lambda Functions
    // ========================================

    // Common environment variables for all Lambda functions
    const commonEnv = {
      DB_PROXY_ENDPOINT: this.dbProxy.endpoint,
      DB_SECRET_ARN: this.dbSecret.secretArn,
      DB_NAME: 'officeLeaseDB',
      NODE_ENV: 'production',
    };

    // Lambda function for authorizer
    const authorizerFunction = new lambda.Function(this, 'AuthorizerFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'authorizer.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-authorizer',
      description: 'Lambda authorizer for API Gateway',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for properties
    const propertiesFunction = new lambda.Function(this, 'PropertiesFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'properties.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-properties',
      description: 'CRUD operations for properties',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for suites
    const suitesFunction = new lambda.Function(this, 'SuitesFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'suites.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-suites',
      description: 'CRUD operations for suites',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for parties
    const partiesFunction = new lambda.Function(this, 'PartiesFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'parties.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-parties',
      description: 'CRUD operations for parties',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for leases
    const leasesFunction = new lambda.Function(this, 'LeasesFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'leases.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-leases',
      description: 'CRUD operations for leases and versions',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for rent schedules
    const rentSchedulesFunction = new lambda.Function(this, 'RentSchedulesFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'rent-schedules.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-rent-schedules',
      description: 'CRUD operations for rent schedules',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for OpEx pass-throughs
    const opexFunction = new lambda.Function(this, 'OpexFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'opex-pass-throughs.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-opex',
      description: 'CRUD operations for OpEx pass-throughs',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for options
    const optionsFunction = new lambda.Function(this, 'OptionsFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'options.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-options',
      description: 'CRUD operations for options',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for concessions
    const concessionsFunction = new lambda.Function(this, 'ConcessionsFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'concessions.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-concessions',
      description: 'CRUD operations for concessions',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for critical dates
    const criticalDatesFunction = new lambda.Function(this, 'CriticalDatesFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'critical-dates.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-critical-dates',
      description: 'CRUD operations for critical dates',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for document links
    const docLinksFunction = new lambda.Function(this, 'DocLinksFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'doc-links.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-doc-links',
      description: 'CRUD operations for document links',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for reports
    const reportsFunction = new lambda.Function(this, 'ReportsFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'reports.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-reports',
      description: 'Reporting endpoints for lease data',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for batch operations
    const batchFunction = new lambda.Function(this, 'BatchFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'batch.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-batch',
      description: 'Batch operations for lease data',
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: commonEnv,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Lambda function for natural language queries
    const nlqFunction = new lambda.Function(this, 'NlqFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'nlq.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      functionName: 'office-lease-api-nlq',
      description: 'Natural language query processor',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        ...commonEnv,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
      },
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.lambdaSecurityGroup],
      role: this.leaseAppRwRole,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant Bedrock access to NLQ function
    nlqFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    // ========================================
    // API Gateway HTTP API
    // ========================================

    // Create Lambda authorizer
    const lambdaAuthorizer = new apigatewayv2Authorizers.HttpLambdaAuthorizer(
      'LambdaAuthorizer',
      authorizerFunction,
      {
        authorizerName: 'office-lease-authorizer',
        responseTypes: [apigatewayv2Authorizers.HttpLambdaResponseType.IAM],
        resultsCacheTtl: cdk.Duration.minutes(5),
      }
    );

    // Create HTTP API
    this.httpApi = new apigatewayv2.HttpApi(this, 'OfficeLeasesApi', {
      apiName: 'office-leases-api',
      description: 'REST API for Office Lease Data Platform',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
        maxAge: cdk.Duration.hours(1),
      },
      defaultAuthorizer: lambdaAuthorizer,
    });

    // Configure throttling and CloudWatch logging on default stage
    const defaultStage = this.httpApi.defaultStage?.node.defaultChild as apigatewayv2.CfnStage;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = {
        throttlingBurstLimit: 2000,
        throttlingRateLimit: 1000,
      };
      defaultStage.accessLogSettings = {
        destinationArn: apiLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          ip: '$context.identity.sourceIp',
          requestTime: '$context.requestTime',
          httpMethod: '$context.httpMethod',
          routeKey: '$context.routeKey',
          status: '$context.status',
          protocol: '$context.protocol',
          responseLength: '$context.responseLength',
          integrationErrorMessage: '$context.integrationErrorMessage',
        }),
      };
    }

    // Grant API Gateway permission to write logs
    apiLogGroup.grantWrite(new iam.ServicePrincipal('apigateway.amazonaws.com'));

    // ========================================
    // Lambda Integrations
    // ========================================

    // Properties endpoints
    const propertiesIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'PropertiesIntegration',
      propertiesFunction
    );
    this.httpApi.addRoutes({
      path: '/properties',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: propertiesIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/properties/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: propertiesIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Suites endpoints
    const suitesIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'SuitesIntegration',
      suitesFunction
    );
    this.httpApi.addRoutes({
      path: '/suites',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: suitesIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/suites/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: suitesIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Parties endpoints
    const partiesIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'PartiesIntegration',
      partiesFunction
    );
    this.httpApi.addRoutes({
      path: '/parties',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: partiesIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/parties/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: partiesIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Leases endpoints
    const leasesIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'LeasesIntegration',
      leasesFunction
    );
    this.httpApi.addRoutes({
      path: '/leases',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: leasesIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/leases/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT],
      integration: leasesIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/leases/{id}/versions',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: leasesIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Rent schedules endpoints
    const rentSchedulesIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'RentSchedulesIntegration',
      rentSchedulesFunction
    );
    this.httpApi.addRoutes({
      path: '/rent-schedules',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: rentSchedulesIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/rent-schedules/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: rentSchedulesIntegration,
      authorizer: lambdaAuthorizer,
    });

    // OpEx pass-throughs endpoints
    const opexIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'OpexIntegration',
      opexFunction
    );
    this.httpApi.addRoutes({
      path: '/opex-pass-throughs',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: opexIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/opex-pass-throughs/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: opexIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Options endpoints
    const optionsIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'OptionsIntegration',
      optionsFunction
    );
    this.httpApi.addRoutes({
      path: '/options',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: optionsIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/options/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: optionsIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/options/{id}/exercise',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: optionsIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Concessions endpoints
    const concessionsIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'ConcessionsIntegration',
      concessionsFunction
    );
    this.httpApi.addRoutes({
      path: '/concessions',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: concessionsIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/concessions/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: concessionsIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Critical dates endpoints
    const criticalDatesIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'CriticalDatesIntegration',
      criticalDatesFunction
    );
    this.httpApi.addRoutes({
      path: '/critical-dates',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: criticalDatesIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/critical-dates/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: criticalDatesIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Document links endpoints
    const docLinksIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'DocLinksIntegration',
      docLinksFunction
    );
    this.httpApi.addRoutes({
      path: '/doc-links',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: docLinksIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/doc-links/{id}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE],
      integration: docLinksIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Reports endpoints
    const reportsIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'ReportsIntegration',
      reportsFunction
    );
    this.httpApi.addRoutes({
      path: '/reports/expirations',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: reportsIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/reports/rent-roll',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: reportsIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/reports/options',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: reportsIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/reports/free-rent',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: reportsIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/reports/ti-allowances',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: reportsIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/reports/critical-dates',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: reportsIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/reports/amendments',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: reportsIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/reports/opex-summary',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: reportsIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Batch operations endpoints
    const batchIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'BatchIntegration',
      batchFunction
    );
    this.httpApi.addRoutes({
      path: '/batch/properties',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: batchIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/batch/parties',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: batchIntegration,
      authorizer: lambdaAuthorizer,
    });
    this.httpApi.addRoutes({
      path: '/batch/leases',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: batchIntegration,
      authorizer: lambdaAuthorizer,
    });

    // Natural language query endpoint
    const nlqIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'NlqIntegration',
      nlqFunction
    );
    this.httpApi.addRoutes({
      path: '/query/natural-language',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: nlqIntegration,
      authorizer: lambdaAuthorizer,
    });

    // ========================================
    // CloudFormation Outputs
    // ========================================
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: 'OfficeLease-VpcId',
    });

    new cdk.CfnOutput(this, 'DatabaseClusterEndpoint', {
      value: this.dbCluster.clusterEndpoint.hostname,
      description: 'Aurora cluster writer endpoint',
      exportName: 'OfficeLease-DbClusterEndpoint',
    });

    new cdk.CfnOutput(this, 'DatabaseClusterReadEndpoint', {
      value: this.dbCluster.clusterReadEndpoint.hostname,
      description: 'Aurora cluster reader endpoint',
      exportName: 'OfficeLease-DbClusterReadEndpoint',
    });

    new cdk.CfnOutput(this, 'DatabaseProxyEndpoint', {
      value: this.dbProxy.endpoint,
      description: 'RDS Proxy endpoint for connection pooling',
      exportName: 'OfficeLease-DbProxyEndpoint',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.dbSecret.secretArn,
      description: 'Secrets Manager ARN for database credentials',
      exportName: 'OfficeLease-DbSecretArn',
    });

    new cdk.CfnOutput(this, 'DatabaseName', {
      value: 'officeLeaseDB',
      description: 'Database name',
      exportName: 'OfficeLease-DbName',
    });

    new cdk.CfnOutput(this, 'LeaseAppRwRoleArn', {
      value: this.leaseAppRwRole.roleArn,
      description: 'IAM role ARN for application read-write access',
      exportName: 'OfficeLease-LeaseAppRwRoleArn',
    });

    new cdk.CfnOutput(this, 'AnalystRoRoleArn', {
      value: this.analystRoRole.roleArn,
      description: 'IAM role ARN for analyst read-only access',
      exportName: 'OfficeLease-AnalystRoRoleArn',
    });

    new cdk.CfnOutput(this, 'AdminDbaRoleArn', {
      value: this.adminDbaRole.roleArn,
      description: 'IAM role ARN for database administration',
      exportName: 'OfficeLease-AdminDbaRoleArn',
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: 'Security group ID for Lambda functions',
      exportName: 'OfficeLease-LambdaSecurityGroupId',
    });

    new cdk.CfnOutput(this, 'KmsKeyId', {
      value: kmsKey.keyId,
      description: 'KMS key ID for encryption',
      exportName: 'OfficeLease-KmsKeyId',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.httpApi.url || '',
      description: 'API Gateway endpoint URL',
      exportName: 'OfficeLease-ApiUrl',
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: this.httpApi.apiId,
      description: 'API Gateway ID',
      exportName: 'OfficeLease-ApiId',
    });

    // ========================================
    // CloudWatch Dashboards and Alarms
    // ========================================

    // SNS Topic for alarm notifications
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'office-lease-alarms',
      displayName: 'Office Lease Database Alarms',
    });

    // Add email subscription (configure via environment variable or parameter)
    if (process.env.ALARM_EMAIL) {
      new sns.Subscription(this, 'AlarmEmailSubscription', {
        topic: alarmTopic,
        protocol: sns.SubscriptionProtocol.EMAIL,
        endpoint: process.env.ALARM_EMAIL,
      });
    }

    // API Gateway Alarms
    const apiErrorRateAlarm = new cloudwatch.Alarm(this, 'ApiErrorRateAlarm', {
      alarmName: 'office-lease-api-error-rate',
      alarmDescription: 'API error rate exceeds 5% for 5 minutes',
      metric: this.httpApi.metricServerError({
        statistic: 'Sum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 5,
      evaluationPeriods: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    apiErrorRateAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    const apiLatencyAlarm = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      alarmName: 'office-lease-api-latency',
      alarmDescription: 'API latency exceeds 2 seconds at p95',
      metric: this.httpApi.metricLatency({
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 2000, // 2 seconds in milliseconds
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    apiLatencyAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // Lambda Alarms
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: 'office-lease-lambda-errors',
      alarmDescription: 'Lambda errors exceed 10 in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: {
          FunctionName: propertiesFunction.functionName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // Database Alarms
    const dbCpuAlarm = new cloudwatch.Alarm(this, 'DatabaseCpuAlarm', {
      alarmName: 'office-lease-db-cpu',
      alarmDescription: 'Database CPU exceeds 80% for 10 minutes',
      metric: this.dbCluster.metricCPUUtilization({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dbCpuAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    const dbConnectionsAlarm = new cloudwatch.Alarm(this, 'DatabaseConnectionsAlarm', {
      alarmName: 'office-lease-db-connections',
      alarmDescription: 'Database connections exceed 90% of max',
      metric: this.dbCluster.metricDatabaseConnections({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 90, // Adjust based on max_connections setting
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dbConnectionsAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'OfficeLeaseDashboard', {
      dashboardName: 'office-lease-data-platform',
    });

    // API Gateway Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Request Count',
        left: [
          this.httpApi.metricCount({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Error Rate',
        left: [
          this.httpApi.metricClientError({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: '4xx Errors',
          }),
          this.httpApi.metricServerError({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: '5xx Errors',
          }),
        ],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Latency',
        left: [
          this.httpApi.metricLatency({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Average',
          }),
          this.httpApi.metricLatency({
            statistic: 'p95',
            period: cdk.Duration.minutes(5),
            label: 'p95',
          }),
          this.httpApi.metricLatency({
            statistic: 'p99',
            period: cdk.Duration.minutes(5),
            label: 'p99',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Integration Latency',
        left: [
          this.httpApi.metricIntegrationLatency({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    // Lambda Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda - Invocations',
        left: [
          propertiesFunction.metricInvocations({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Properties',
          }),
          leasesFunction.metricInvocations({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Leases',
          }),
          reportsFunction.metricInvocations({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Reports',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda - Errors',
        left: [
          propertiesFunction.metricErrors({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Properties',
          }),
          leasesFunction.metricErrors({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Leases',
          }),
          reportsFunction.metricErrors({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Reports',
          }),
        ],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda - Duration',
        left: [
          propertiesFunction.metricDuration({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Properties Avg',
          }),
          leasesFunction.metricDuration({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Leases Avg',
          }),
          reportsFunction.metricDuration({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Reports Avg',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda - Concurrent Executions',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'ConcurrentExecutions',
            statistic: 'Maximum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    // Database Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Database - CPU Utilization',
        left: [
          this.dbCluster.metricCPUUtilization({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Database - Connections',
        left: [
          this.dbCluster.metricDatabaseConnections({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Database - Read/Write IOPS',
        left: [
          this.dbCluster.metricVolumeReadIOPs({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Read IOPS',
          }),
          this.dbCluster.metricVolumeWriteIOPs({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Write IOPS',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Database - Connections',
        left: [
          this.dbCluster.metricDatabaseConnections({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'Database Connections',
          }),
        ],
        width: 12,
      })
    );

    // Custom Business Metrics
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'API Health',
        metrics: [
          this.httpApi.metricCount({
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
            label: 'Total Requests',
          }),
        ],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Error Rate',
        metrics: [
          this.httpApi.metricServerError({
            statistic: 'Sum',
            period: cdk.Duration.hours(1),
            label: '5xx Errors',
          }),
        ],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Avg Latency',
        metrics: [
          this.httpApi.metricLatency({
            statistic: 'Average',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'DB CPU',
        metrics: [
          this.dbCluster.metricCPUUtilization({
            statistic: 'Average',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 6,
      })
    );

    // Output alarm topic ARN
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS topic ARN for alarm notifications',
      exportName: 'OfficeLease-AlarmTopicArn',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });
  }
}
