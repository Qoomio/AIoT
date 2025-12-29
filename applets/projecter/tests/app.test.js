/**
 * Unit Tests for Projecter Applet Core Functions
 */

const fs = require('fs').promises;
const path = require('path');
const assert = require('assert');
const {
  createProject,
  getAvailableTemplates,
  listExistingProjects,
  deleteProject,
  validateProjectRequest,
  createResponse,
  PROJECT_TEMPLATES,
  PROJECTS_ROOT
} = require('../app.js');

// Test configuration
const VALID_PROJECT_NAME = 'test-project-123';
const INVALID_PROJECT_NAME = 'test/project';

/**
 * Validation Tests
 */
async function testValidateProjectRequest() {
  console.log('Testing validateProjectRequest...');
  
  // Test valid request
  const validRequest = { name: 'test-project', language: 'python' };
  const validResult = validateProjectRequest(validRequest);
  assert.strictEqual(validResult.isValid, true);
  assert.strictEqual(validResult.errors.length, 0);
  
  // Test missing body
  const emptyResult = validateProjectRequest(null);
  assert.strictEqual(emptyResult.isValid, false);
  assert(emptyResult.errors.includes('Request body is required'));
  
  // Test missing name
  const noNameResult = validateProjectRequest({ language: 'python' });
  assert.strictEqual(noNameResult.isValid, false);
  assert(noNameResult.errors.some(e => e.includes('Project name is required')));
  
  // Test invalid name
  const invalidNameResult = validateProjectRequest({ name: 'test/project!', language: 'python' });
  assert.strictEqual(invalidNameResult.isValid, false);
  assert(invalidNameResult.errors.some(e => e.includes('can only contain letters')));
  
  // Test missing language
  const noLanguageResult = validateProjectRequest({ name: 'test-project' });
  assert.strictEqual(noLanguageResult.isValid, false);
  assert(noLanguageResult.errors.some(e => e.includes('Language is required')));
  
  // Test invalid language
  const invalidLanguageResult = validateProjectRequest({ name: 'test-project', language: 'invalid' });
  assert.strictEqual(invalidLanguageResult.isValid, false);
  assert(invalidLanguageResult.errors.some(e => e.includes('must be one of:')));
  
  console.log('✓ validateProjectRequest tests passed');
}

/**
 * Template Tests
 */
async function testGetAvailableTemplates() {
  console.log('Testing getAvailableTemplates...');
  
  const templates = getAvailableTemplates();
  
  // Should return array
  assert(Array.isArray(templates));
  
  // Should have at least 3 templates (python, nodejs, c)
  assert(templates.length >= 3);
  
  // Check required fields
  templates.forEach(template => {
    assert(typeof template.id === 'string');
    assert(typeof template.name === 'string');
    assert(typeof template.description === 'string');
    assert(Array.isArray(template.files));
  });
  
  // Check specific templates exist
  const templateIds = templates.map(t => t.id);
  assert(templateIds.includes('python'));
  assert(templateIds.includes('nodejs'));
  assert(templateIds.includes('c'));
  
  console.log('✓ getAvailableTemplates tests passed');
}

/**
 * Project Creation Tests
 */
async function testCreateProject() {
  console.log('Testing createProject...');
  
  try {
    // Test successful project creation
    const result = await createProject('test-unit-python', 'python');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.name, 'test-unit-python');
    assert.strictEqual(result.data.language, 'python');
    
    // Check if project directory was created
    const projectPath = path.join(PROJECTS_ROOT, 'test-unit-python');
    const stats = await fs.stat(projectPath);
    assert(stats.isDirectory());
    
    // Check if template files were created
    const files = await fs.readdir(projectPath);
    assert(files.includes('main.py'));
    assert(files.includes('requirements.txt'));
    assert(files.includes('README.md'));
    
    // Test duplicate project creation
    const duplicateResult = await createProject('test-unit-python', 'python');
    assert.strictEqual(duplicateResult.success, false);
    assert(duplicateResult.error.includes('already exists'));
    
    // Test invalid language
    const invalidResult = await createProject('test-invalid', 'invalid-lang');
    assert.strictEqual(invalidResult.success, false);
    assert(invalidResult.error.includes('not found'));
    
    console.log('✓ createProject tests passed');
  } finally {
    // Clean up test projects
    try {
      await fs.rm(path.join(PROJECTS_ROOT, 'test-unit-python'), { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Project Listing Tests
 */
async function testListExistingProjects() {
  console.log('Testing listExistingProjects...');
  
  const testProjects = ['test-list-python', 'test-list-nodejs', 'test-list-c'];
  
  try {
    // Create test projects
    await createProject('test-list-python', 'python');
    await createProject('test-list-nodejs', 'nodejs');
    await createProject('test-list-c', 'c');
    
    // Test projects listing
    const projects = await listExistingProjects();
    assert(Array.isArray(projects));
    
    // Check that our test projects are in the list
    const ourTestProjects = projects.filter(p => testProjects.includes(p.name));
    assert(ourTestProjects.length >= 3);
    
    // Check project properties
    ourTestProjects.forEach(project => {
      assert(typeof project.name === 'string');
      assert(typeof project.path === 'string');
      assert(typeof project.language === 'string');
      assert(project.created instanceof Date);
      assert(project.modified instanceof Date);
    });
    
    // Check specific projects
    const projectNames = ourTestProjects.map(p => p.name);
    assert(projectNames.includes('test-list-python'));
    assert(projectNames.includes('test-list-nodejs'));
    assert(projectNames.includes('test-list-c'));
    
    // Check language detection
    const pythonProject = ourTestProjects.find(p => p.name === 'test-list-python');
    assert.strictEqual(pythonProject.language, 'python');
    
    console.log('✓ listExistingProjects tests passed');
  } finally {
    // Clean up test projects
    for (const projectName of testProjects) {
      try {
        await fs.rm(path.join(PROJECTS_ROOT, projectName), { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Project Deletion Tests
 */
async function testDeleteProject() {
  console.log('Testing deleteProject...');
  
  try {
    // Create test project
    await createProject('test-delete-unit', 'python');
    
    // Verify project exists
    let projects = await listExistingProjects();
    assert(projects.some(p => p.name === 'test-delete-unit'));
    
    // Test successful deletion
    const deleteResult = await deleteProject('test-delete-unit');
    assert.strictEqual(deleteResult.success, true);
    assert.strictEqual(deleteResult.data.name, 'test-delete-unit');
    
    // Verify project was deleted
    projects = await listExistingProjects();
    assert(!projects.some(p => p.name === 'test-delete-unit'));
    
    // Test deleting non-existent project
    const notFoundResult = await deleteProject('non-existent-unit-test');
    assert.strictEqual(notFoundResult.success, false);
    assert(notFoundResult.error.includes('does not exist'));
    
    console.log('✓ deleteProject tests passed');
  } finally {
    // Clean up in case test failed
    try {
      await fs.rm(path.join(PROJECTS_ROOT, 'test-delete-unit'), { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Response Helper Tests
 */
async function testCreateResponse() {
  console.log('Testing createResponse...');
  
  // Test success response
  const successResponse = createResponse(true, { test: 'data' }, 'Success message');
  assert.strictEqual(successResponse.success, true);
  assert.deepStrictEqual(successResponse.data, { test: 'data' });
  assert.strictEqual(successResponse.message, 'Success message');
  assert(typeof successResponse.timestamp === 'string');
  
  // Test error response
  const errorResponse = createResponse(false, null, 'Error message');
  assert.strictEqual(errorResponse.success, false);
  assert.strictEqual(errorResponse.data, null);
  assert.strictEqual(errorResponse.message, 'Error message');
  assert(typeof errorResponse.timestamp === 'string');
  
  console.log('✓ createResponse tests passed');
}

/**
 * Template Content Tests
 */
async function testTemplateContent() {
  console.log('Testing template content...');
  
  // Check that all templates have required properties
  for (const [key, template] of Object.entries(PROJECT_TEMPLATES)) {
    assert(typeof template.name === 'string');
    assert(typeof template.description === 'string');
    assert(typeof template.files === 'object');
    
    // Check that template files are not empty
    for (const [fileName, content] of Object.entries(template.files)) {
      assert(typeof content === 'string');
      assert(content.length > 0);
      assert(!content.includes('undefined'));
    }
  }
  
  // Check specific template requirements
  assert(PROJECT_TEMPLATES.python.files['main.py']);
  assert(PROJECT_TEMPLATES.python.files['requirements.txt']);
  assert(PROJECT_TEMPLATES.python.files['README.md']);
  
  assert(PROJECT_TEMPLATES.nodejs.files['package.json']);
  assert(PROJECT_TEMPLATES.nodejs.files['index.js']);
  assert(PROJECT_TEMPLATES.nodejs.files['README.md']);
  
  assert(PROJECT_TEMPLATES.c.files['main.c']);
  assert(PROJECT_TEMPLATES.c.files['Makefile']);
  assert(PROJECT_TEMPLATES.c.files['README.md']);
  
  console.log('✓ Template content tests passed');
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('Starting Projecter Applet Tests...\n');
  
  try {
    await testValidateProjectRequest();
    await testGetAvailableTemplates();
    await testCreateProject();
    await testListExistingProjects();
    await testDeleteProject();
    await testCreateResponse();
    await testTemplateContent();
    
    console.log('\n✅ All tests passed successfully!');
    return true;
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = {
  runAllTests,
  testValidateProjectRequest,
  testGetAvailableTemplates,
  testCreateProject,
  testListExistingProjects,
  testDeleteProject,
  testCreateResponse,
  testTemplateContent
}; 