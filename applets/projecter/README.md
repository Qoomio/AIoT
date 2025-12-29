# Projecter Applet

A comprehensive project creation system for the qoom2 application that generates Hello World projects in Python, Node.js, and C programming languages.

## Overview

The Projecter applet provides a user-friendly interface for creating starter projects with proper file structures, dependencies, and documentation. Projects are created in the `/projects` directory and can be managed through both a web interface and REST API.

## Features

### ✅ Implemented Features

- **Multi-language Support**: Python, Node.js, and C project templates
- **Web Interface**: Beautiful, responsive UI with VS Code-inspired dark theme
- **REST API**: Complete API for programmatic project management
- **Admin Portal Integration**: Accessible through the admin dashboard
- **Project Templates**: Pre-configured files with best practices
- **Validation**: Input sanitization and error handling
- **Language Detection**: Automatic detection of project types
- **Comprehensive Testing**: Unit and integration test suites

### 🎯 Project Templates

#### Python Projects
- `main.py` - Main application file with hello world example
- `requirements.txt` - Dependency management file
- `README.md` - Project documentation with usage instructions

#### Node.js Projects  
- `package.json` - Project configuration and dependencies
- `index.js` - Main application file with hello world example
- `README.md` - Project documentation with usage instructions

#### C Projects
- `main.c` - Main source file with hello world example
- `Makefile` - Build configuration with common targets
- `README.md` - Project documentation with build instructions

## API Endpoints

### GET `/projecter/`
Serves the web interface for project creation and management.

**Response**: HTML page with project creation interface

### GET `/projecter/templates`
Returns available project templates.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "python",
      "name": "Python",
      "description": "Python Hello World project with main.py and requirements.txt",
      "files": ["main.py", "requirements.txt", "README.md"]
    }
  ],
  "message": "Templates retrieved successfully",
  "timestamp": "2025-01-17T13:59:23.817Z"
}
```

### POST `/projecter/create`
Creates a new project with the specified name and language.

**Request Body**:
```json
{
  "name": "my-awesome-project",
  "language": "python"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "name": "my-awesome-project",
    "language": "python",
    "path": "/home/user/qoom2/projects/my-awesome-project",
    "template": "Python",
    "files": ["main.py", "requirements.txt", "README.md"]
  },
  "message": "Project created successfully",
  "timestamp": "2025-01-17T13:59:23.817Z"
}
```

### GET `/projecter/projects`
Lists all existing projects in the projects directory.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "my-awesome-project",
      "path": "/home/user/qoom2/projects/my-awesome-project",
      "language": "python",
      "created": "2025-01-17T13:59:23.817Z",
      "modified": "2025-01-17T13:59:23.817Z"
    }
  ],
  "message": "Projects retrieved successfully",
  "timestamp": "2025-01-17T13:59:23.817Z"
}
```

### DELETE `/projecter/projects/:name`
Deletes an existing project.

**Parameters**: 
- `name` - The name of the project to delete

**Response**:
```json
{
  "success": true,
  "data": null,
  "message": "Project deleted successfully",
  "timestamp": "2025-01-17T13:59:23.817Z"
}
```

## Usage

### Via Web Interface

1. Start the qoom2 server: `node --watch server.js`
2. Open your browser to `http://localhost:3000/projecter/`
3. Select a programming language (Python, Node.js, or C)
4. Enter a project name (letters, numbers, underscores, and hyphens only)
5. Click "Create Project"
6. The project will be created in the `/projects` directory
7. Use the "Open" button to edit the project in the qoom2 editor
8. Use the "Delete" button to remove projects

### Via API

```bash
# Get available templates
curl http://localhost:3000/projecter/templates

# Create a new Python project
curl -X POST http://localhost:3000/projecter/create \
  -H "Content-Type: application/json" \
  -d '{"name":"my-python-app","language":"python"}'

# List all projects
curl http://localhost:3000/projecter/projects

# Delete a project
curl -X DELETE http://localhost:3000/projecter/projects/my-python-app
```

### Via Admin Portal

1. Access the admin portal (typically through the admin applet)
2. Look for the "Project Creator" card
3. Click to open the project creation interface

## File Structure

```
applets/projecter/
├── api.js              # Route definitions and HTTP handlers
├── app.js              # Core business logic and utilities
├── admin.json          # Admin portal configuration
├── todos.md            # Implementation task list
├── README.md           # This documentation
└── tests/              # Test suite
    ├── app.test.js     # Unit tests for core functions
    ├── api.test.js     # Integration tests for API endpoints
    ├── run-tests.js    # Test runner script
    └── demo.js         # Functionality demonstration
```

## Validation and Security

- **Input Validation**: Project names are restricted to alphanumeric characters, underscores, and hyphens
- **Path Traversal Protection**: Project names are sanitized to prevent directory traversal attacks
- **Duplicate Prevention**: Checks for existing projects before creation
- **Error Handling**: Comprehensive error handling with descriptive messages
- **Logging**: All operations are logged for monitoring and debugging

## Testing

The projecter applet includes comprehensive test coverage:

### Running Tests

```bash
# Run all tests
cd applets/projecter/tests
node run-tests.js

# Run only unit tests
node run-tests.js --unit-only

# Run only API integration tests (requires running server)
node run-tests.js --api-only

# Show verbose output
node run-tests.js --verbose
```

### Test Coverage

- ✅ Input validation for project names and languages
- ✅ Template generation and file creation
- ✅ Project listing and language detection
- ✅ Project deletion and cleanup
- ✅ API endpoint functionality
- ✅ Error handling and edge cases
- ✅ Complete workflow testing

### Demonstration

```bash
# Run the functionality demo
cd applets/projecter/tests
node demo.js
```

## Future Enhancements

Potential improvements for future versions:

- **Custom Templates**: Allow users to create custom project templates
- **Git Integration**: Initialize projects with git repositories
- **Package Manager Integration**: Automatic dependency installation
- **Project Scaffolding**: Generate additional boilerplate files
- **Template Variables**: Support for customizable template placeholders
- **Bulk Operations**: Create multiple projects at once
- **Project Analytics**: Usage statistics and project insights

## Dependencies

The projecter applet uses only Node.js built-in modules:
- `fs.promises` - File system operations
- `path` - Path manipulation utilities
- `http` - HTTP server functionality (via qoom2 server)

## Contributing

When contributing to the projecter applet:

1. Follow the established coding patterns in the qoom2 project
2. Add tests for new functionality
3. Update documentation for API changes
4. Ensure backward compatibility
5. Test with all supported languages

## License

This applet is part of the qoom2 project and follows the same licensing terms. 