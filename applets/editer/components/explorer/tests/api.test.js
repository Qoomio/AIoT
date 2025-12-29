/**
 * Explorer Sub-Applet API Tests
 * 
 * Tests for the directory listing API functionality.
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock the explorer API
const explorerApi = require('../api.js');

describe('Explorer API Tests', function() {
    let server;
    const testPort = 3001;
    
    before(function(done) {
        // Create a simple test server
        server = http.createServer((req, res) => {
            const route = explorerApi.routes.find(r => r.path === '/_api/directory' && r.method === 'GET');
            if (route && req.url.includes('_api/directory')) {
                route.handler(req, res);
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        
        server.listen(testPort, done);
    });
    
    after(function(done) {
        server.close(done);
    });
    
    describe('Directory Listing API', function() {
        it('should return directory contents for root path', function(done) {
            const options = {
                hostname: 'localhost',
                port: testPort,
                path: '/_api/directory?path=.',
                method: 'GET'
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        assert.strictEqual(response.success, true);
                        assert.ok(Array.isArray(response.data.contents));
                        assert.strictEqual(response.data.path, '.');
                        done();
                    } catch (error) {
                        done(error);
                    }
                });
            });
            
            req.on('error', done);
            req.end();
        });
        
        it('should handle invalid directory paths', function(done) {
            const options = {
                hostname: 'localhost',
                port: testPort,
                path: '/_api/directory?path=../../../etc',
                method: 'GET'
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        assert.strictEqual(response.success, false);
                        assert.ok(response.error);
                        done();
                    } catch (error) {
                        done(error);
                    }
                });
            });
            
            req.on('error', done);
            req.end();
        });
        
        it('should handle non-existent directory paths', function(done) {
            const options = {
                hostname: 'localhost',
                port: testPort,
                path: '/_api/directory?path=nonexistent-directory',
                method: 'GET'
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        assert.strictEqual(response.success, false);
                        assert.ok(response.error);
                        done();
                    } catch (error) {
                        done(error);
                    }
                });
            });
            
            req.on('error', done);
            req.end();
        });
    });
    
    describe('API Metadata', function() {
        it('should have correct metadata', function() {
            assert.strictEqual(explorerApi.meta.name, 'File Explorer');
            assert.strictEqual(explorerApi.meta.description, 'Directory browsing and file tree navigation');
            assert.strictEqual(explorerApi.prefix, '/editer/explorer');
            assert.ok(Array.isArray(explorerApi.routes));
        });
    });
});

// Export for use in other test files
module.exports = {
    testPort
}; 