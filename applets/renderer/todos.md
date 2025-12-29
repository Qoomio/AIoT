# Renderer Applet Todos
**Purpose**: Render certain file types in specialized HTML pages for enhanced viewing. Uses the route: `/render/*(filepath)`.

## Supported File Types
- **Markdown (*.md)** - Rendered HTML with syntax highlighting
- **CSV (*.csv)** - Interactive table format with sorting/filtering
- **JSON (*.json)** - Collapsible/expandable tree format
- **Images** - Zoom/pan viewer with controls
- **Videos** - Full-featured media player
- **API.js files** - Interactive API testing interface (Swagger-like)

## Backend Implementation

### Core API Routes
- [ ] **Create api.js** - Main API handler for renderer routes
  - [ ] `GET /render/*` - Main route handler for file rendering
  - [ ] `GET /_api/render/file-info/:filepath` - Get file metadata and type
  - [ ] `GET /_api/render/preview/:filepath` - Get file preview/thumbnail
  - [ ] `POST /_api/render/api-test` - Test API endpoints from api.js files

### File Type Detection
- [ ] **Create file-detector.js** - File type detection module
  - [ ] Detect file types by extension and MIME type
  - [ ] Support for markdown (.md, .markdown)
  - [ ] Support for CSV (.csv, .tsv)
  - [ ] Support for JSON (.json, .jsonl)
  - [ ] Support for images (.jpg, .jpeg, .png, .gif, .webp, .svg)
  - [ ] Support for videos (.mp4, .webm, .avi, .mov, .mkv)
  - [ ] Support for API files (api.js)
  - [ ] Fallback to text rendering for unsupported types

### File Processing
- [ ] **Create markdown-processor.js** - Markdown rendering
  - [ ] Parse markdown to HTML (consider marked.js or similar)
  - [ ] Support for syntax highlighting in code blocks
  - [ ] Support for tables, links, images
  - [ ] Support for math expressions (optional)
  - [ ] Generate table of contents

- [ ] **Create csv-processor.js** - CSV data processing
  - [ ] Parse CSV files with proper delimiter detection
  - [ ] Handle quoted values and escaped characters
  - [ ] Support for TSV and other delimited formats
  - [ ] Data type inference for columns
  - [ ] Handle large CSV files with pagination

- [ ] **Create json-processor.js** - JSON data processing
  - [ ] Parse and validate JSON structure
  - [ ] Generate hierarchical tree representation
  - [ ] Handle large JSON files efficiently
  - [ ] Support for JSONL (JSON Lines) format
  - [ ] Syntax highlighting and formatting

- [ ] **Create api-analyzer.js** - API.js file analysis
  - [ ] Parse route definitions from api.js files
  - [ ] Extract route parameters, methods, handlers
  - [ ] Generate API documentation automatically
  - [ ] Support for middleware analysis
  - [ ] Create interactive testing interface

## Frontend Implementation

### Core Renderer Interface
- [ ] **Create app.js** - Main renderer application logic
  - [ ] File type detection and routing to appropriate renderer
  - [ ] Common header/navigation for all rendered files
  - [ ] Breadcrumb navigation for file paths
  - [ ] Error handling for unsupported files
  - [ ] Loading states and progress indicators

### Markdown Renderer
- [ ] **Create markdown-viewer.js** - Markdown display component
  - [ ] Styled HTML output with VS Code theme
  - [ ] Syntax highlighting for code blocks
  - [ ] Table of contents navigation
  - [ ] Print-friendly formatting
  - [ ] Copy code block functionality

### CSV Renderer
- [ ] **Create csv-viewer.js** - CSV table component
  - [ ] Interactive data table with sorting
  - [ ] Column filtering and search
  - [ ] Pagination for large datasets
  - [ ] Export functionality (CSV, JSON)
  - [ ] Column resizing and reordering
  - [ ] Data type indicators

### JSON Renderer
- [ ] **Create json-viewer.js** - JSON tree component
  - [ ] Collapsible/expandable tree structure
  - [ ] Syntax highlighting
  - [ ] Search within JSON data
  - [ ] Copy value/path functionality
  - [ ] Raw/formatted view toggle
  - [ ] Schema validation display (optional)

### Image Renderer
- [ ] **Create image-viewer.js** - Image display component
  - [ ] Zoom in/out with mouse wheel
  - [ ] Pan with mouse drag
  - [ ] Fit to screen/actual size buttons
  - [ ] Image metadata display (EXIF data)
  - [ ] Download/save functionality
  - [ ] Support for SVG interactive elements

### Video Renderer
- [ ] **Create video-player.js** - Video player component
  - [ ] Custom video controls
  - [ ] Play/pause/stop functionality
  - [ ] Scrubbing timeline
  - [ ] Volume control
  - [ ] Playback speed controls
  - [ ] Fullscreen support
  - [ ] Loop/repeat options

### API Testing Interface
- [ ] **Create api-tester.js** - API testing component
  - [ ] Route listing with method indicators
  - [ ] Parameter input forms
  - [ ] Request/response display
  - [ ] Authentication handling
  - [ ] Request history
  - [ ] Export as curl commands
  - [ ] Response formatting (JSON, HTML, etc.)

## Styling and UI

### Core Styling
- [ ] **Create renderer.css** - Base styles for all renderers
  - [ ] Dark theme consistent with application
  - [ ] Responsive design for mobile/desktop
  - [ ] Print styles for markdown/text content
  - [ ] Common navigation and header styles
  - [ ] Loading animations and indicators

### Component-Specific Styles
- [ ] **Markdown styles** - Typography and code highlighting
- [ ] **Table styles** - Sortable headers, zebra striping
- [ ] **JSON tree styles** - Indentation, syntax colors
- [ ] **Media viewer styles** - Controls and overlays
- [ ] **API tester styles** - Form layouts, response display

## Advanced Features

### Performance Optimization
- [ ] **Implement lazy loading** - For large files and components
  - [ ] Virtual scrolling for large tables/JSON
  - [ ] Progressive image loading
  - [ ] Chunked CSV processing
  - [ ] Background file processing

### Search and Navigation
- [ ] **Add search functionality**
  - [ ] Full-text search in rendered content
  - [ ] JSON path search
  - [ ] Table column search
  - [ ] API endpoint search

### Export and Sharing
- [ ] **Export capabilities**
  - [ ] Export rendered content as PDF
  - [ ] Export filtered CSV data
  - [ ] Export API documentation
  - [ ] Share links with specific views/filters

### Caching and Performance
- [ ] **Implement caching**
  - [ ] Cache rendered content
  - [ ] File metadata caching
  - [ ] Progressive enhancement
  - [ ] Optimize bundle sizes

## Integration and Testing

### Server Integration
- [ ] **Integrate with main server.js**
  - [ ] Add renderer route registration
  - [ ] File access validation
  - [ ] Error handling and logging
  - [ ] Performance monitoring

### Testing
- [ ] **Create test suite**
  - [ ] Unit tests for file processors
  - [ ] Integration tests for renderers
  - [ ] Performance tests with large files
  - [ ] Cross-browser compatibility tests
  - [ ] Mobile device testing

### Documentation
- [ ] **Create usage documentation**
  - [ ] Supported file types and features
  - [ ] URL format and parameters
  - [ ] Configuration options
  - [ ] Troubleshooting guide

## Technical Considerations

### Security
- [ ] **Security measures**
  - [ ] File path validation and sanitization
  - [ ] Prevent directory traversal
  - [ ] Content Security Policy headers
  - [ ] XSS prevention in rendered content
  - [ ] File size limits

### Error Handling
- [ ] **Robust error handling**
  - [ ] Graceful degradation for unsupported files
  - [ ] User-friendly error messages
  - [ ] Fallback to raw text view
  - [ ] Logging for debugging

### Configuration
- [ ] **Add configuration options**
  - [ ] File size limits
  - [ ] Supported file types toggle
  - [ ] Rendering quality settings
  - [ ] Feature flags for experimental renderers

## Dependencies

### Backend Dependencies
- [ ] **Markdown processing** - Consider marked.js or markdown-it
- [ ] **CSV parsing** - Consider papaparse or csv-parser
- [ ] **Image metadata** - Consider exif-reader
- [ ] **Syntax highlighting** - Consider highlight.js or prism

### Frontend Dependencies
- [ ] **UI components** - Keep minimal, prefer vanilla JS
- [ ] **Video player** - Consider HTML5 native or video.js
- [ ] **JSON tree** - Custom implementation preferred
- [ ] **Virtual scrolling** - For performance with large datasets

## Implementation Priority

### Phase 1 (MVP)
1. Basic file type detection
2. Markdown renderer
3. JSON renderer
4. Image viewer

### Phase 2 (Enhanced)
1. CSV renderer with basic table
2. Video player
3. API testing interface

### Phase 3 (Advanced)
1. Advanced filtering and search
2. Export functionality
3. Performance optimizations
4. Mobile optimization
