/**
 * Authorization Test Script
 * Demonstrates role-based access control functionality
 */

const authorization = require('./db/authorization');

// Test events simulating different roles and methods
const testCases = [
  {
    name: 'lease_app_rw with GET',
    event: {
      httpMethod: 'GET',
      path: '/properties',
      requestContext: {
        authorizer: {
          role: 'lease_app_rw',
          principalArn: 'arn:aws:iam::123456789012:role/lease_app_rw'
        }
      }
    },
    expectedResult: 'ALLOWED'
  },
  {
    name: 'lease_app_rw with POST',
    event: {
      httpMethod: 'POST',
      path: '/properties',
      requestContext: {
        authorizer: {
          role: 'lease_app_rw',
          principalArn: 'arn:aws:iam::123456789012:role/lease_app_rw'
        }
      }
    },
    expectedResult: 'ALLOWED'
  },
  {
    name: 'analyst_ro with GET',
    event: {
      httpMethod: 'GET',
      path: '/reports/expirations',
      requestContext: {
        authorizer: {
          role: 'analyst_ro',
          principalArn: 'arn:aws:iam::123456789012:role/analyst_ro'
        }
      }
    },
    expectedResult: 'ALLOWED'
  },
  {
    name: 'analyst_ro with POST',
    event: {
      httpMethod: 'POST',
      path: '/properties',
      requestContext: {
        authorizer: {
          role: 'analyst_ro',
          principalArn: 'arn:aws:iam::123456789012:role/analyst_ro'
        }
      }
    },
    expectedResult: 'DENIED'
  },
  {
    name: 'analyst_ro with PUT',
    event: {
      httpMethod: 'PUT',
      path: '/properties/1',
      requestContext: {
        authorizer: {
          role: 'analyst_ro',
          principalArn: 'arn:aws:iam::123456789012:role/analyst_ro'
        }
      }
    },
    expectedResult: 'DENIED'
  },
  {
    name: 'analyst_ro with DELETE',
    event: {
      httpMethod: 'DELETE',
      path: '/properties/1',
      requestContext: {
        authorizer: {
          role: 'analyst_ro',
          principalArn: 'arn:aws:iam::123456789012:role/analyst_ro'
        }
      }
    },
    expectedResult: 'DENIED'
  },
  {
    name: 'admin_dba with GET',
    event: {
      httpMethod: 'GET',
      path: '/properties',
      requestContext: {
        authorizer: {
          role: 'admin_dba',
          principalArn: 'arn:aws:iam::123456789012:role/admin_dba'
        }
      }
    },
    expectedResult: 'ALLOWED'
  },
  {
    name: 'admin_dba with POST',
    event: {
      httpMethod: 'POST',
      path: '/properties',
      requestContext: {
        authorizer: {
          role: 'admin_dba',
          principalArn: 'arn:aws:iam::123456789012:role/admin_dba'
        }
      }
    },
    expectedResult: 'ALLOWED'
  },
  {
    name: 'No role with GET',
    event: {
      httpMethod: 'GET',
      path: '/properties',
      requestContext: {}
    },
    expectedResult: 'DENIED'
  },
  {
    name: 'Unknown role with GET',
    event: {
      httpMethod: 'GET',
      path: '/properties',
      requestContext: {
        authorizer: {
          role: 'unknown_role',
          principalArn: 'arn:aws:iam::123456789012:role/unknown_role'
        }
      }
    },
    expectedResult: 'DENIED'
  }
];

// Run tests
console.log('='.repeat(80));
console.log('AUTHORIZATION TEST RESULTS');
console.log('='.repeat(80));
console.log();

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log('-'.repeat(80));
  
  try {
    const result = authorization.authorizeRequest(testCase.event);
    
    if (testCase.expectedResult === 'ALLOWED') {
      console.log('✅ PASS - Authorization granted as expected');
      console.log(`   Role: ${result.role}`);
      console.log(`   Principal: ${result.principal}`);
      passed++;
    } else {
      console.log('❌ FAIL - Expected DENIED but got ALLOWED');
      console.log(`   Role: ${result.role}`);
      console.log(`   Principal: ${result.principal}`);
      failed++;
    }
  } catch (error) {
    if (testCase.expectedResult === 'DENIED' && error.code === 'FORBIDDEN') {
      console.log('✅ PASS - Authorization denied as expected');
      console.log(`   Reason: ${error.details.reason}`);
      passed++;
    } else {
      console.log('❌ FAIL - Unexpected error');
      console.log(`   Error: ${error.message}`);
      console.log(`   Code: ${error.code}`);
      failed++;
    }
  }
  
  console.log();
});

console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`Total Tests: ${testCases.length}`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ❌`);
console.log(`Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
console.log('='.repeat(80));

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);
