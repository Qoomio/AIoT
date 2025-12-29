# Previewer TODOs
**Purpose:** To provide Visual Studio-like preview panel using Monaco Editor. It should render files using the renderer applet for side-by-side editing and live preview.

## Overview
The previewer subapplet integrates into the Monaco Editor interface to provide real-time preview capabilities for various file types. It leverages the existing renderer applet for actual file rendering while providing the UI framework for side-by-side editing.

## Implementation Plan

### Phase 1: Core Infrastructure
1. **API Structure** - Create basic api.js with preview endpoints
2. **App Logic** - Core application logic with renderer integration
3. **Frontend Integration** - Hook into Monaco Editor's layout system

### Phase 2: Preview Functionality  
4. **Auto-Detection** - Detect previewable file types and toggle preview panel
5. **Real-time Updates** - Live preview updates as user types (debounced)
6. **Layout Controls** - Toggle panel, adjust splits, switch layouts

### Phase 3: Advanced Features
7. **Sync Scrolling** - Synchronized scrolling between editor and preview
8. **Error Handling** - Comprehensive error handling and fallback states
9. **Performance** - Optimize with caching and lazy loading
10. **Keyboard Shortcuts** - Common preview operations shortcuts

## Technical Details

### Integration Points
- **Monaco Editor**: Hook into editor events for content changes
- **Renderer Applet**: Use existing `/render/*` endpoints for file rendering
- **Editer Layout**: Integrate with existing editor layout system

### Supported File Types
- Markdown (.md) - Live preview with syntax highlighting
- JSON (.json) - Formatted JSON tree view
- Images (.jpg, .png, etc.) - Image preview with zoom controls
- Text files - Basic text preview
- Future: HTML, CSV, etc.

### UI Components
- **Preview Panel**: Embedded iframe/div for rendered content
- **Layout Controls**: Toggle, resize, and layout switching buttons
- **Status Indicators**: Show preview status and file type
- **Error States**: Display errors and fallback messages

### Performance Considerations
- **Debounced Updates**: Prevent excessive re-rendering during typing
- **Lazy Loading**: Only load preview when panel is visible
- **Caching**: Cache rendered content for unchanged files
- **Memory Management**: Cleanup resources when switching files

## Integration Requirements
- Must work with existing Monaco Editor setup
- Should not interfere with editor performance
- Must handle file switching gracefully
- Should provide seamless user experience

## Error Handling
- Handle renderer applet failures
- Provide fallback for unsupported file types
- Show user-friendly error messages
- Maintain editor functionality if preview fails