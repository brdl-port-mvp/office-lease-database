#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { LeaseDatabaseStack } from './lease-database-stack';

const app = new cdk.App();

new LeaseDatabaseStack(app, 'OfficeLeaseDatabaseStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  }
});

app.synth();
