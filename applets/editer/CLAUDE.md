# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# esbuild-based build (faster, does NOT bundle Monaco — Monaco is loaded externally)
node build.js

# Vite-based build (bundles Monaco into a single file, Raspberry Pi optimized)
node build-vite.js
```

Both builders write output to `dist/`. The Vite build is the production path: it produces `dist/editer.bundle.js` and `dist/monaco-editor.css`, with console.log stripped and minified for Raspberry Pi targets.

## Architecture Overview

This is the **editer applet** — a Monaco Editor-based file editor served at `/edit/*`. It runs inside a larger Qoom platform (the host platform registers applets via `api.js` exports).

### Backend (Node.js, ES modules)

- `api.js` — Entry point for the platform router. Exports `{ meta, prefix: '/edit', routes }`. The single `GET /*` handler serves `frontend/editer.html` with a `window.__QOOM_CONFIG` script injected (`NODE_ENV`, `HIDE_AI_PANE`).
- `app.js` — Helper utilities: `findFirstFile()` (auto-selects a `.py`/`.js` file to open on empty path), `readFileContent()`.
- `utils/common.js` — Shared backend utilities: `isValidFilePath`, `sanitizeFilePath`, `logActivity`, `sendApiResponse`. Re-exports template utilities from `../../shared/utils/template.js`.

Each component under `components/` that needs backend routes exports its own `api.js` with the same `{ meta, prefix, routes }` shape, and is registered separately by the platform.

### Frontend

Entry point: `frontend/editer.js`  
Main model: `frontend/model.js` — `Editer` class that owns all component model instances.

The editor is divided into components, each in `components/<name>/frontend/`:

| Component | Role |
|---|---|
| `editorLayout` | Multi-pane Monaco editor with tabs; owns the active file state |
| `explorer` | File tree browser; backend at `/editer/explorer/_api/directory` |
| `chat` | AI chat panel (OpenAI); backend at `/chat/message` |
| `contexter` | Manages file context sent to AI |
| `controller` | Top control bar (save, run, etc.) |
| `versioner` | File version history (`.versions/` snapshots) |
| `previewer` | Live preview panel |
| `notifier` | Notification bar |
| `monaco-settings` | Monaco editor settings UI |
| `creater` | File/folder creation; backend in `components/creater/api.js` |
| `uploader` | File uploads; backend in `components/uploader/api.js` |
| `searcher` | Search/replace; backend in `components/searcher/api.js` |

Each component follows the same structure:
```
components/<name>/
  frontend/
    model.js      # State model class (no DOM)
    <name>.js     # UI rendering and event wiring
    <name>.html   # HTML template
    <name>.css    # Styles
  api.js          # Backend routes (if needed)
  app.js          # Backend helpers (if needed)
```

### Inter-component Communication

`utils/qoomEvent.js` is a singleton event bus wrapping `CustomEvent` / `window.addEventListener`. Components communicate by calling `qoomEvent.emit(eventName, data, debounce?)` and listening with `qoomEvent.on(eventName, callback)`. Use this pattern — not direct model references — when components need to react to each other's changes.

### External Dependencies (not bundled by esbuild, bundled by Vite)

- `/view/applets/navigater/frontend/navigater.js` — Platform navigation injection
- `/view/applets/shared/file-types-config.js` — `isVideoExtension`, `isImageExtension`
- `/view/applets/shared/marked.esm.js` — Markdown rendering in previewer
- `monaco-editor/` (local copy) — loaded from `/view/applets/editer/monaco-editor/esm/vs/editor/editor.main.js`

Monaco workers are disabled (stubbed out) for Raspberry Pi compatibility — do not re-enable them.

### File Path Security

All file paths from URL/request must go through `isValidFilePath` (blocks `..`) and `sanitizeFilePath` (normalizes) from `utils/common.js` before any filesystem access.

## Planned Refactoring (todos.md)

The `todos.md` documents an in-progress refactor to extract `explorer`, `creater`, and `uploader` into sub-applets with their own API routes. This work is incomplete — check component presence before assuming a route exists.
