/**
 * Renderer Applet Tests
 * Tests for file rendering functionality, focusing on markdown rendering
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { 
  detectFileType, 
  getFileMetadata, 
  isFileAccessible, 
  isPathSafe,
  formatFileSize,
  FILE_TYPES
} = require('../file-detector');
const { handleRenderRoute, handleFileInfo } = require('../app');

// Test configuration
const TEST_PORT = 3001;
const TEST_SERVER_URL = `http://localhost:${TEST_PORT}`;

// Test utilities
function createMockRequest(url, method = 'GET') {
  return {
    url,
    method,
    headers: {}
  };
}

function createMockResponse() {
  const response = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead: function(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = { ...this.headers, ...headers };
    },
    end: function(data) {
      this.body = data;
    },
    json: function(data) {
      this.writeHead(200, { 'Content-Type': 'application/json' });
      this.end(JSON.stringify(data));
    },
    status: function(code) {
      this.statusCode = code;
      return {
        json: (data) => {
          this.writeHead(code, { 'Content-Type': 'application/json' });
          this.end(JSON.stringify(data));
        }
      };
    }
  };
  return response;
}

// Test runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🚀 Running Renderer Applet Tests...\n');
    
    for (const test of this.tests) {
      try {
        await test.fn();
        console.log(`✅ ${test.name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${test.name}`);
        console.log(`   Error: ${error.message}`);
        this.failed++;
      }
    }
    
    console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

// Test assertions
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertContains(text, substring, message) {
  if (!text.includes(substring)) {
    throw new Error(`${message || 'Assertion failed'}: expected text to contain "${substring}"`);
  }
}

// Initialize test runner
const runner = new TestRunner();

// File Detection Tests
runner.test('detectFileType - should detect markdown files', async () => {
  const result = detectFileType('test.md');
  assertEquals(result.type, 'markdown');
  assertEquals(result.renderer, 'markdown');
  assertEquals(result.extension, '.md');
  assertEquals(result.supported, true);
});

runner.test('detectFileType - should detect different markdown extensions', async () => {
  const extensions = ['.md', '.markdown', '.mdown', '.mkd'];
  
  for (const ext of extensions) {
    const result = detectFileType(`test${ext}`);
    assertEquals(result.type, 'markdown');
    assertEquals(result.renderer, 'markdown');
    assertEquals(result.extension, ext);
    assertEquals(result.supported, true);
  }
});

runner.test('detectFileType - should detect other file types', async () => {
  const testCases = [
    { file: 'test.json', type: 'json', renderer: 'json' },
    { file: 'test.csv', type: 'csv', renderer: 'csv' },
    { file: 'test.jpg', type: 'image', renderer: 'image' },
    { file: 'test.txt', type: 'text', renderer: 'text' },
    { file: 'unknown.xyz', type: 'unknown', renderer: 'text' }
  ];
  
  for (const testCase of testCases) {
    const result = detectFileType(testCase.file);
    assertEquals(result.type, testCase.type);
    assertEquals(result.renderer, testCase.renderer);
  }
});

// Path Safety Tests
runner.test('isPathSafe - should validate safe paths', async () => {
  const safePaths = [
    'test.md',
    'folder/test.md',
    'deep/nested/folder/test.md',
    'applets/renderer/test.md'
  ];
  
  for (const safePath of safePaths) {
    assert(isPathSafe(safePath), `Path should be safe: ${safePath}`);
  }
});

runner.test('isPathSafe - should reject unsafe paths', async () => {
  const unsafePaths = [
    '../test.md',
    '../../etc/passwd',
    '/etc/passwd',
    '~/test.md',
    'folder/../../../test.md'
  ];
  
  for (const unsafePath of unsafePaths) {
    assert(!isPathSafe(unsafePath), `Path should be unsafe: ${unsafePath}`);
  }
});

// File Accessibility Tests
runner.test('isFileAccessible - should detect accessible files', async () => {
  const testFile = 'test-sample.md';
  const result = await isFileAccessible(testFile);
  assert(result, 'Test markdown file should be accessible');
});

runner.test('isFileAccessible - should detect inaccessible files', async () => {
  const nonExistentFile = 'non-existent-file.md';
  const result = await isFileAccessible(nonExistentFile);
  assert(!result, 'Non-existent file should not be accessible');
});

// File Metadata Tests
runner.test('getFileMetadata - should return correct metadata for markdown file', async () => {
  const testFile = 'test-sample.md';
  const metadata = await getFileMetadata(testFile);
  
  assertEquals(metadata.type, 'markdown');
  assertEquals(metadata.renderer, 'markdown');
  assertEquals(metadata.extension, '.md');
  assertEquals(metadata.filename, 'test-sample.md');
  assertEquals(metadata.path, testFile);
  assert(metadata.size > 0, 'File should have size > 0');
  assert(metadata.isFile, 'Should be a file');
  assert(!metadata.isDirectory, 'Should not be a directory');
});

// Format File Size Tests
runner.test('formatFileSize - should format sizes correctly', async () => {
  const testCases = [
    { bytes: 0, expected: '0 B' },
    { bytes: 1024, expected: '1 KB' },
    { bytes: 1536, expected: '1.5 KB' },
    { bytes: 1048576, expected: '1 MB' },
    { bytes: 1073741824, expected: '1 GB' }
  ];
  
  for (const testCase of testCases) {
    const result = formatFileSize(testCase.bytes);
    assertEquals(result, testCase.expected);
  }
});

// Route Handler Tests
runner.test('handleRenderRoute - should handle valid markdown file', async () => {
  const req = createMockRequest('/render/test-sample.md');
  const res = createMockResponse();
  
  await handleRenderRoute(req, res);
  
  assertEquals(res.statusCode, 200);
  assertEquals(res.headers['Content-Type'], 'text/html');
  assertContains(res.body, '<!DOCTYPE html>', 'Response should contain HTML');
  assertContains(res.body, 'test-sample.md', 'Response should contain filename');
  assertContains(res.body, 'markdown-content', 'Response should contain markdown renderer');
});

runner.test('handleRenderRoute - should handle non-existent file', async () => {
  const req = createMockRequest('/render/non-existent.md');
  const res = createMockResponse();
  
  await handleRenderRoute(req, res);
  
  assertEquals(res.statusCode, 404);
  const responseData = JSON.parse(res.body);
  assertEquals(responseData.success, false);
  assertContains(responseData.error, 'not found', 'Error should mention file not found');
});

runner.test('handleRenderRoute - should handle unsafe paths', async () => {
  const req = createMockRequest('/render/../../../etc/passwd');
  const res = createMockResponse();
  
  await handleRenderRoute(req, res);
  
  assertEquals(res.statusCode, 400);
  const responseData = JSON.parse(res.body);
  assertEquals(responseData.success, false);
  assertContains(responseData.error, 'Invalid file path', 'Error should mention invalid path');
});

runner.test('handleFileInfo - should return file info for markdown file', async () => {
  const req = createMockRequest('/_api/render/file-info/test-sample.md');
  const res = createMockResponse();
  
  await handleFileInfo(req, res);
  
  assertEquals(res.statusCode, 200);
  const responseData = JSON.parse(res.body);
  assertEquals(responseData.success, true);
  assertEquals(responseData.data.type, 'markdown');
  assertEquals(responseData.data.renderer, 'markdown');
  assertEquals(responseData.data.filename, 'test-sample.md');
  assert(responseData.data.formattedSize, 'Should include formatted size');
});

runner.test('handleFileInfo - should handle non-existent file', async () => {
  const req = createMockRequest('/_api/render/file-info/non-existent.md');
  const res = createMockResponse();
  
  await handleFileInfo(req, res);
  
  assertEquals(res.statusCode, 404);
  const responseData = JSON.parse(res.body);
  assertEquals(responseData.success, false);
  assertContains(responseData.error, 'not found', 'Error should mention file not found');
});

// Markdown Rendering Tests
runner.test('markdown rendering - should handle headers', async () => {
  const req = createMockRequest('/render/test-sample.md');
  const res = createMockResponse();
  
  await handleRenderRoute(req, res);
  
  assertEquals(res.statusCode, 200);
  // Check that markdown rendering JavaScript is included
  assertContains(res.body, 'renderMarkdown', 'Should include markdown rendering function');
  assertContains(res.body, 'loadMarkdown', 'Should include markdown loading function');
  assertContains(res.body, 'replace(/^# (.*$)/gim', 'Should include header parsing');
});

runner.test('markdown rendering - should include all markdown features', async () => {
  const req = createMockRequest('/render/test-sample.md');
  const res = createMockResponse();
  
  await handleRenderRoute(req, res);
  
  assertEquals(res.statusCode, 200);
  const jsCode = res.body;
  
  // Check for all markdown features
  assertContains(jsCode, 'replace(/^### (.*$)/gim', 'Should handle H3 headers');
  assertContains(jsCode, 'replace(/^## (.*$)/gim', 'Should handle H2 headers');
  assertContains(jsCode, 'replace(/^# (.*$)/gim', 'Should handle H1 headers');
  assertContains(jsCode, 'replace(/\\*\\*(.*?)\\*\\*/gim', 'Should handle bold text');
  assertContains(jsCode, 'replace(/\\*(.*?)\\*/gim', 'Should handle italic text');
  assertContains(jsCode, 'replace(/```([\\s\\S]*?)```/gim', 'Should handle code blocks');
  assertContains(jsCode, 'replace(/`(.*?)`/gim', 'Should handle inline code');
  assertContains(jsCode, 'replace(/^\\s*\\* (.*$)/gim', 'Should handle list items');
});

// CSS Styles Tests
runner.test('markdown CSS - should include proper styling', async () => {
  const req = createMockRequest('/render/test-sample.md');
  const res = createMockResponse();
  
  await handleRenderRoute(req, res);
  
  assertEquals(res.statusCode, 200);
  const cssCode = res.body;
  
  // Check for markdown-specific CSS
  assertContains(cssCode, '.markdown-content', 'Should include markdown content styles');
  assertContains(cssCode, 'max-width: 800px', 'Should have max-width for readability');
  assertContains(cssCode, 'line-height: 1.6', 'Should have proper line height');
  assertContains(cssCode, 'background: #2d2d30', 'Should have dark theme code background');
  assertContains(cssCode, 'border-left: 4px solid #0e639c', 'Should have blockquote styling');
});

// Integration Test Setup
runner.test('integration - file system integration', async () => {
  // Verify test file exists and has expected content
  const testFile = 'test-sample.md';
  const resolvedPath = path.resolve(process.cwd(), testFile);
  
  assert(fs.existsSync(resolvedPath), 'Test sample file should exist');
  
  const content = fs.readFileSync(resolvedPath, 'utf8');
  assertContains(content, '# Test Markdown File', 'Should contain test header');
  assertContains(content, '**bold text**', 'Should contain bold text');
  assertContains(content, '`inline code`', 'Should contain inline code');
  assertContains(content, '```', 'Should contain code blocks');
});

// Run all tests
if (require.main === module) {
  runner.run().catch(console.error);
}

module.exports = {
  TestRunner,
  assert,
  assertEquals,
  assertContains,
  createMockRequest,
  createMockResponse
}; 