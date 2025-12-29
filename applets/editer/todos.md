# Editer TODOs

## Overview

Refactor the monolithic editer applet into focused sub-applets following the single responsibility principle.

## Create Explorer Sub-Applet

**Purpose**: Provide directory browsing and file tree navigation functionality
**Current Location**: Currently embedded in editer applet

### File Structure

```
applets/editer/explorer/
├── api.js          # Directory listing API routes
├── app.js          # Directory helper functions
├── frontend/       # Frontend assets
│   ├── explorer.html
│   ├── explorer.css
│   └── explorer.js
└── tests/          # Unit tests
    ├── api.test.js
    └── app.test.js
```

### Implementation Steps

-   [ ] **Create folder structure**

    -   Create `applets/editer/explorer/` directory
    -   Create `frontend/` and `tests/` subdirectories

-   [ ] **Move API routes from editer/api.js**

    -   Extract `/_api/directory` route handler to `explorer/api.js`
    -   Route should be accessible at `/editer/explorer/_api/directory`
    -   Maintain same response format: `{ success: true, path: string, contents: array }`

-   [ ] **Move helper functions from editer/app.js**

    -   Extract `getDirectoryContents()` function to `explorer/app.js`
    -   Keep same function signature and behavior

-   [ ] **Extract frontend code from generateEditorHTML()**

    -   Move file explorer CSS (`.file-explorer`, `.explorer-*`, `.file-tree`, etc.) to `frontend/explorer.css`
    -   Move file explorer JavaScript functions to `frontend/explorer.js`:
        -   `loadDirectory()`
        -   `createFileTreeHTML()`
        -   `refreshFileTree()`
        -   `loadDirectoryContents()`
        -   `attachFileTreeEvents()`
    -   Create `frontend/explorer.html` as standalone component
    -   Update main editer to include/embed explorer component

-   [ ] **Create API specification**

    ```javascript
    // explorer/api.js
    module.exports = {
      prefix: '/editer/explorer',
      routes: [
        {
          path: '/_api/directory',
          method: 'GET',
          handler: // moved from editer
        }
      ]
    };
    ```

-   [ ] **Create tests**
    -   Test directory listing API endpoint
    -   Test `getDirectoryContents()` function with various paths
    -   Test error handling for invalid paths

## Create Creater Sub-Applet

**Purpose**: Handle creating new files and folders
**New Functionality**: Not currently implemented

### File Structure

```
applets/editer/creater/
├── api.js          # File/folder creation API routes
├── app.js          # Creation helper functions
├── frontend/       # Frontend assets
│   ├── creater.html
│   ├── creater.css
│   └── creater.js
└── tests/          # Unit tests
    ├── api.test.js
    └── app.test.js
```

### Implementation Steps

-   [ ] **Create folder structure**

    -   Create `applets/editer/creater/` directory
    -   Create `frontend/` and `tests/` subdirectories

-   [ ] **Create API routes in creater/api.js**

    ```javascript
    // Routes to implement:
    // POST /edit/creater/_api/file     - Create new file
    // POST /edit/creater/_api/folder   - Create new folder
    // POST /edit/creater/_api/template - Create from template
    ```

-   [ ] **Create helper functions in creater/app.js**

    -   `createFile(filePath, content)` - Create new file with content
    -   `createFolder(folderPath)` - Create new folder
    -   `createFromTemplate(templateName, targetPath)` - Create from template
    -   `validateCreationPath(path)` - Validate path for creation
    -   `getTemplatesList()` - Get available templates

-   [ ] **Create frontend UI**

    -   Modal/dialog for file creation
    -   Form for folder creation
    -   Template selection interface
    -   Integration with explorer for refresh after creation

-   [ ] **Create tests**
    -   Test file creation API endpoints
    -   Test folder creation functionality
    -   Test template system
    -   Test path validation

## Create Uploader Sub-Applet

**Purpose**: Handle file and folder uploads
**New Functionality**: Not currently implemented

### File Structure

```
applets/editer/uploader/
├── api.js          # File upload API routes
├── app.js          # Upload helper functions
├── frontend/       # Frontend assets
│   ├── uploader.html
│   ├── uploader.css
│   └── uploader.js
└── tests/          # Unit tests
    ├── api.test.js
    └── app.test.js
```

### Implementation Steps

-   [ ] **Create folder structure**

    -   Create `applets/editer/uploader/` directory
    -   Create `frontend/` and `tests/` subdirectories

-   [ ] **Create API routes in uploader/api.js**

    ```javascript
    // Routes to implement:
    // POST /edit/uploader/_api/file     - Upload single file
    // POST /edit/uploader/_api/files    - Upload multiple files
    // POST /edit/uploader/_api/folder   - Upload folder/zip
    // GET  /edit/uploader/_api/progress - Get upload progress
    ```

-   [ ] **Create helper functions in uploader/app.js**

    -   `handleFileUpload(file, targetPath)` - Process single file upload
    -   `handleMultipleFiles(files, targetPath)` - Process multiple files
    -   `handleFolderUpload(folderData, targetPath)` - Process folder upload
    -   `validateUploadPath(path)` - Validate upload destination
    -   `getUploadProgress(uploadId)` - Track upload progress

-   [ ] **Create frontend UI**

    -   Drag-and-drop upload interface
    -   File selection dialog
    -   Upload progress indicators
    -   Integration with explorer for refresh after upload

-   [ ] **Create tests**
    -   Test file upload API endpoints
    -   Test multi-file upload functionality
    -   Test folder upload
    -   Test progress tracking

## Shared Utilities

**Purpose**: Common functions used across sub-applets

### Implementation Steps

-   [ ] **Create shared utilities file** - `applets/editer/utils/common.js`

    -   Move `isValidFilePath()`, `sanitizeFilePath()`, `logActivity()` from app.js
    -   Make these functions available to all sub-applets

-   [ ] **Update import statements** across all sub-applets to use shared utilities

## Integration & Communication

**Purpose**: Ensure sub-applets work together seamlessly

### Implementation Steps

-   [ ] **Update main editer applet**

    -   Remove extracted functionality from `api.js` and `app.js`
    -   Update `generateEditorHTML()` to embed sub-applet components
    -   Add script/style includes for sub-applet frontends

-   [ ] **Create sub-applet registration system**

    -   Auto-discover sub-applets in editer folder
    -   Register their routes with main routing system
    -   Ensure proper route prefixing

-   [ ] **Implement inter-applet communication**
    -   Event system for refreshing explorer after file operations
    -   Shared state management for current directory
    -   Consistent error handling across sub-applets

## Testing & Validation

-   [ ] **Integration tests** - Test all sub-applets working together
-   [ ] **Performance tests** - Ensure no degradation after refactoring
-   [ ] **UI/UX tests** - Verify user experience remains seamless
-   [ ] **Security tests** - Validate path traversal protection across all sub-applets

## Migration Strategy

1. **Phase 1**: Create explorer sub-applet (least disruptive)
2. **Phase 2**: Add creater sub-applet (new functionality)
3. **Phase 3**: Add uploader sub-applet (new functionality)
4. **Phase 4**: Clean up and optimize integration
