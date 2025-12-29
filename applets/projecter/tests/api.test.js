/**
 * Integration Tests for Projecter Applet API Endpoints
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');

// Test configuration
const TEST_PORT = 3001;
const TEST_HOST = 'localhost';
const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;
const TEST_PROJECTS_ROOT = path.join(process.cwd(), 'test-projects-api');

/**
 * Test helper functions
 */
async function cleanup() {
  try {
    await fs.rm(TEST_PROJECTS_ROOT, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

async function setupTestEnvironment() {
  await cleanup();
  await fs.mkdir(TEST_PROJECTS_ROOT, { recursive: true });
}

/**
 * HTTP request helper
 */
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: `/projecter${path}`,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsedData = res.headers['content-type']?.includes('application/json') 
            ? JSON.parse(data) 
            : data;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Test server availability
 */
async function testServerConnection() {
  console.log('Testing server connection...');
  
  try {
    const response = await makeRequest('/templates');
    assert(response.statusCode < 500, 'Server should be running');
    console.log('✓ Server connection test passed');
    return true;
  } catch (error) {
    console.log('⚠ Server connection failed. Make sure the server is running on port 3000.');
    console.log('  You can start it with: node --watch server.js');
    return false;
  }
}

/**
 * Test GET /templates endpoint
 */
async function testGetTemplates() {
  console.log('Testing GET /templates...');
  
  const response = await makeRequest('/templates');
  
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.success, true);
  assert(Array.isArray(response.data.data));
  assert(response.data.data.length >= 3);
  
  // Check template structure
  response.data.data.forEach(template => {
    assert(typeof template.id === 'string');
    assert(typeof template.name === 'string');
    assert(typeof template.description === 'string');
    assert(Array.isArray(template.files));
  });
  
  // Check specific templates
  const templateIds = response.data.data.map(t => t.id);
  assert(templateIds.includes('python'));
  assert(templateIds.includes('nodejs'));
  assert(templateIds.includes('c'));
  
  console.log('✓ GET /templates test passed');
}

/**
 * Test POST /create endpoint
 */
async function testPostCreate() {
  console.log('Testing POST /create...');
  
  // Test successful creation
  const createResponse = await makeRequest('/create', {
    method: 'POST',
    body: {
      name: 'test-api-project',
      language: 'python'
    }
  });
  
  assert.strictEqual(createResponse.statusCode, 201);
  assert.strictEqual(createResponse.data.success, true);
  assert.strictEqual(createResponse.data.data.name, 'test-api-project');
  assert.strictEqual(createResponse.data.data.language, 'python');
  
  // Test validation errors
  const invalidResponse = await makeRequest('/create', {
    method: 'POST',
    body: {
      name: 'test/invalid!',
      language: 'python'
    }
  });
  
  assert.strictEqual(invalidResponse.statusCode, 400);
  assert.strictEqual(invalidResponse.data.success, false);
  assert(invalidResponse.data.message.includes('can only contain letters'));
  
  // Test missing fields
  const missingFieldsResponse = await makeRequest('/create', {
    method: 'POST',
    body: {}
  });
  
  assert.strictEqual(missingFieldsResponse.statusCode, 400);
  assert.strictEqual(missingFieldsResponse.data.success, false);
  
  // Test duplicate creation
  const duplicateResponse = await makeRequest('/create', {
    method: 'POST',
    body: {
      name: 'test-api-project',
      language: 'python'
    }
  });
  
  assert.strictEqual(duplicateResponse.statusCode, 400);
  assert.strictEqual(duplicateResponse.data.success, false);
  assert(duplicateResponse.data.message.includes('already exists'));
  
  console.log('✓ POST /create test passed');
}

/**
 * Test GET /projects endpoint
 */
async function testGetProjects() {
  console.log('Testing GET /projects...');
  
  const response = await makeRequest('/projects');
  
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.success, true);
  assert(Array.isArray(response.data.data));
  
  // Should have at least the project we created in testPostCreate
  assert(response.data.data.length >= 1);
  
  // Check project structure
  response.data.data.forEach(project => {
    assert(typeof project.name === 'string');
    assert(typeof project.path === 'string');
    assert(typeof project.language === 'string');
    assert(typeof project.created === 'string'); // ISO date string
    assert(typeof project.modified === 'string'); // ISO date string
  });
  
  // Check for our test project
  const testProject = response.data.data.find(p => p.name === 'test-api-project');
  assert(testProject, 'Test project should be in the list');
  assert.strictEqual(testProject.language, 'python');
  
  console.log('✓ GET /projects test passed');
}

/**
 * Test DELETE /projects/:name endpoint
 */
async function testDeleteProject() {
  console.log('Testing DELETE /projects/:name...');
  
  // Test successful deletion
  const deleteResponse = await makeRequest('/projects/test-api-project', {
    method: 'DELETE'
  });
  
  assert.strictEqual(deleteResponse.statusCode, 200);
  assert.strictEqual(deleteResponse.data.success, true);
  
  // Verify project was deleted
  const listResponse = await makeRequest('/projects');
  const testProject = listResponse.data.data.find(p => p.name === 'test-api-project');
  assert(!testProject, 'Test project should be deleted');
  
  // Test deleting non-existent project
  const notFoundResponse = await makeRequest('/projects/non-existent', {
    method: 'DELETE'
  });
  
  assert.strictEqual(notFoundResponse.statusCode, 400);
  assert.strictEqual(notFoundResponse.data.success, false);
  assert(notFoundResponse.data.message.includes('does not exist'));
  
  console.log('✓ DELETE /projects/:name test passed');
}

/**
 * Test GET / (frontend) endpoint
 */
async function testGetFrontend() {
  console.log('Testing GET / (frontend)...');
  
  const response = await makeRequest('/');
  
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.headers['content-type'], 'text/html');
  assert(typeof response.data === 'string');
  assert(response.data.includes('Project Creator'));
  assert(response.data.includes('Python'));
  assert(response.data.includes('Node.js'));
  assert(response.data.includes('C'));
  
  console.log('✓ GET / (frontend) test passed');
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  console.log('Testing error handling...');
  
  // Test invalid JSON
  const response = await makeRequest('/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'invalid-json'
  });
  
  // Should handle invalid JSON gracefully
  assert(response.statusCode >= 400);
  
  console.log('✓ Error handling test passed');
}

/**
 * Test complete workflow
 */
async function testCompleteWorkflow() {
  console.log('Testing complete workflow...');
  
  // 1. Get templates
  const templatesResponse = await makeRequest('/templates');
  assert.strictEqual(templatesResponse.statusCode, 200);
  
  // 2. Create projects for each language
  const languages = ['python', 'nodejs', 'c'];
  
  for (const language of languages) {
    const createResponse = await makeRequest('/create', {
      method: 'POST',
      body: {
        name: `workflow-test-${language}`,
        language: language
      }
    });
    
    assert.strictEqual(createResponse.statusCode, 201);
    assert.strictEqual(createResponse.data.data.language, language);
  }
  
  // 3. List projects and verify all were created
  const listResponse = await makeRequest('/projects');
  assert.strictEqual(listResponse.statusCode, 200);
  
  for (const language of languages) {
    const project = listResponse.data.data.find(p => p.name === `workflow-test-${language}`);
    assert(project, `Project for ${language} should exist`);
    assert.strictEqual(project.language, language);
  }
  
  // 4. Delete all test projects
  for (const language of languages) {
    const deleteResponse = await makeRequest(`/projects/workflow-test-${language}`, {
      method: 'DELETE'
    });
    assert.strictEqual(deleteResponse.statusCode, 200);
  }
  
  // 5. Verify all projects were deleted
  const finalListResponse = await makeRequest('/projects');
  for (const language of languages) {
    const project = finalListResponse.data.data.find(p => p.name === `workflow-test-${language}`);
    assert(!project, `Project for ${language} should be deleted`);
  }
  
  console.log('✓ Complete workflow test passed');
}

/**
 * Run all API tests
 */
async function runAllApiTests() {
  console.log('Starting Projecter API Integration Tests...\n');
  
  try {
    // Check if server is available
    const serverAvailable = await testServerConnection();
    if (!serverAvailable) {
      console.log('\n⚠ Skipping API tests - server not available');
      return false;
    }
    
    await testGetTemplates();
    await testPostCreate();
    await testGetProjects();
    await testDeleteProject();
    await testGetFrontend();
    await testErrorHandling();
    await testCompleteWorkflow();
    
    console.log('\n✅ All API tests passed successfully!');
    return true;
  } catch (error) {
    console.error('\n❌ API test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllApiTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = {
  runAllApiTests,
  testServerConnection,
  testGetTemplates,
  testPostCreate,
  testGetProjects,
  testDeleteProject,
  testGetFrontend,
  testErrorHandling,
  testCompleteWorkflow
}; 