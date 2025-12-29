#!/usr/bin/env node
/**
 * Test Runner for Projecter Applet
 * 
 * Runs both unit tests and integration tests for the projecter applet.
 * Usage: node run-tests.js [--unit-only] [--api-only] [--verbose]
 */

const { runAllTests: runUnitTests } = require('./app.test.js');
const { runAllApiTests } = require('./api.test.js');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  unitOnly: args.includes('--unit-only'),
  apiOnly: args.includes('--api-only'),
  verbose: args.includes('--verbose'),
  help: args.includes('--help') || args.includes('-h')
};

/**
 * Display help information
 */
function showHelp() {
  console.log(`
Projecter Applet Test Runner

Usage: node run-tests.js [options]

Options:
  --unit-only     Run only unit tests (app.test.js)
  --api-only      Run only API integration tests (api.test.js)
  --verbose       Show detailed output
  --help, -h      Show this help message

Examples:
  node run-tests.js                    # Run all tests
  node run-tests.js --unit-only        # Run only unit tests
  node run-tests.js --api-only         # Run only API tests
  node run-tests.js --verbose          # Run with detailed output

Note for API tests:
  Make sure the qoom2 server is running before running API tests:
  node --watch server.js

The server should be accessible at http://localhost:3000
`);
}

/**
 * Main test runner function
 */
async function runAllProjecterTests() {
  if (options.help) {
    showHelp();
    return true;
  }

  console.log('🚀 Projecter Applet Test Suite');
  console.log('================================\n');

  let unitSuccess = true;
  let apiSuccess = true;

  // Run unit tests
  if (!options.apiOnly) {
    console.log('📋 Running Unit Tests...');
    console.log('------------------------');
    try {
      unitSuccess = await runUnitTests();
    } catch (error) {
      console.error('Unit tests failed:', error.message);
      unitSuccess = false;
    }
    console.log('');
  }

  // Run API integration tests
  if (!options.unitOnly) {
    console.log('🌐 Running API Integration Tests...');
    console.log('-----------------------------------');
    console.log('Note: These tests require the qoom2 server to be running.');
    console.log('Start server with: node --watch server.js\n');
    
    try {
      apiSuccess = await runAllApiTests();
    } catch (error) {
      console.error('API tests failed:', error.message);
      apiSuccess = false;
    }
    console.log('');
  }

  // Summary
  console.log('📊 Test Results Summary');
  console.log('=======================');
  
  if (!options.apiOnly) {
    console.log(`Unit Tests: ${unitSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  }
  
  if (!options.unitOnly) {
    console.log(`API Tests:  ${apiSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  }
  
  const overallSuccess = unitSuccess && apiSuccess;
  console.log(`Overall:    ${overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (overallSuccess) {
    console.log('\n🎉 All tests passed! The projecter applet is ready to use.');
  } else {
    console.log('\n💥 Some tests failed. Please check the output above for details.');
  }
  
  return overallSuccess;
}

/**
 * Error handling and process management
 */
async function main() {
  try {
    const success = await runAllProjecterTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n💥 Test runner failed:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught exception:', error.message);
  if (options.verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  main();
}

module.exports = {
  runAllProjecterTests,
  showHelp
}; 