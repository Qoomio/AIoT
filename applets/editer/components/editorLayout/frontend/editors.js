/**
 * Multi-Editor System JavaScript
 *
 * Handles multiple Monaco editor instances with tabbed interface and drag/drop
 */

"use strict";
import qoomEvent from "../../../utils/qoomEvent.js"
import * as editorPane from "../editorPane/frontend/pane.js"

let state = null;
let editorSyncWS = null;
let reconnectAttempts = 0;
let editorLayout = null;
let remoteUserCursor = null; // 원격 사용자 정보 저장 (1:1 관계)
let cursorChangeListeners = []; // 커서 변경 리스너 저장
let remoteDecorations = []; // 각 pane의 원격 decoration ID 저장

const maxReconnectAttempts = 5;

async function diagnoseSyncFailure() {
	try {
		// Check HTTP health endpoint
		const health = await fetch('/watcher/health', { cache: 'no-store' });
		console.log('[SYNC][diag] /watcher/health status:', health.status);
		if (!health.ok) {
			console.warn('[SYNC][diag] Health check not OK');
		}
	} catch (e) {
		console.warn('[SYNC][diag] Health check failed:', e);
	}

	try {
		// Intentionally hit WS path over HTTP to detect 426 fallback
		const probe = await fetch('/watcher/_sync', { cache: 'no-store' });
		console.log('[SYNC][diag] /watcher/_sync (HTTP) status:', probe.status);
		if (probe.status === 426) {
			probe
				.json()
				.then(data => console.warn('[SYNC][diag] Upgrade guidance:', data))
				.catch(() => {});
		}
	} catch (e) {
		console.warn('[SYNC][diag] Probe to /watcher/_sync failed:', e);
	}
}

/**
 * Open a file in the first available pane and go to a specific line
 */
export async function openFileAtLine(fileName, filePath, lineNumber, columnNumber = 1) {
	if (editorLayout) {
		return await editorLayout.openFileAtLine(fileName, filePath, lineNumber, columnNumber);
	}
}

// This function is kept for backward compatibility
export function shouldUseRenderer(fileName) {
	const ext = fileName.toLowerCase().split(".").pop();
	const rendererExtensions = [
		// Images
		"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico",
		// Videos
		"mp4", "webm", "avi", "mov", "mkv", "wmv", "flv",
		// Audio
		"mp3", "wav", "ogg", "m4a", "aac", "flac",
		// Documents
		"pdf",
	];
	return rendererExtensions.includes(ext);
}

/**
 * Trigger search/find widget for the active editor (Cmd+F functionality)
 * Toggles Monaco's built-in find widget in the active editor pane
 * If the widget is open, it closes it; if closed, it opens it
 */
export function triggerSearch() {
	// Get the active Monaco editor instance from pane.js
	const activeEditor = editorPane.getActiveEditor();

	if (!activeEditor) {
		console.log("No active editor to search in");
		return;
	}

	try {
		// Focus the editor first to ensure find widget appears correctly
		activeEditor.focus();
		
		// Check if find widget is currently visible by checking DOM
		const editorContainer = activeEditor.getContainerDomNode();
		const findWidget = editorContainer.querySelector('.find-widget');
		const isFindWidgetOpen = findWidget && findWidget.classList.contains('visible');
		
		if (isFindWidgetOpen) {
			// Close the find widget using closeFindWidget action
			const closeAction = activeEditor.getAction("actions.closeFindWidget");
			if (closeAction && closeAction.isSupported()) {
				closeAction.run();
				console.log("Search widget closed");
			} else {
				// Fallback: use find controller to close
				try {
					const findController = activeEditor.getContribution('editor.contrib.findController');
					if (findController && findController.closeFindWidget) {
						findController.closeFindWidget();
						console.log("Search widget closed via controller");
					} else {
						// Last resort: try to trigger escape key
						activeEditor.trigger('keyboard', 'editor.action.closeFindWidget', null);
						console.log("Search widget closed via trigger");
					}
				} catch (e) {
					console.error("Error closing find widget:", e);
				}
			}
		} else {
			// Open the find widget
			const findAction = activeEditor.getAction("actions.find");
			if (findAction && findAction.isSupported()) {
				findAction.run();
				console.log("Search widget opened");
			} else {
				console.error("Find action not available");
			}
		}
	} catch (error) {
		console.error("Error triggering search:", error);
	}
}

function hasUnsavedChangesInFile() {
	return editorLayout.panes.some((pane) => pane.tabs.some((tab) => tab.modified));
}

function showSaveNotification(message, type = "info") {
	// Remove existing notification
	const existingNotification = document.querySelector(".save-notification");
	if (existingNotification) {
		existingNotification.remove();
	}

	// Create notification element
	const notification = document.createElement("div");
	notification.className = `save-notification save-notification-${type}`;
	notification.textContent = message;
	notification.style.cssText = `
position: fixed;
top: 20px;
right: 20px;
padding: 12px 16px;
border-radius: 4px;
color: white;
font-size: 14px;
z-index: 10000;
transition: opacity 0.3s ease;
${type === "success" ? "background-color: #28a745;" : ""}
${type === "error" ? "background-color: #dc3545;" : ""}
${type === "info" ? "background-color: #007bff;" : ""}
`;

	document.body.appendChild(notification);

	// Auto-hide after 3 seconds
	setTimeout(() => {
		notification.style.opacity = "0";
		setTimeout(() => {
			notification.remove();
		}, 300);
	}, 3000);
}

async function createFileVersion(filePath, content) {
	try {
		const response = await fetch(`/versions/create/${filePath}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				content: content
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Version creation failed');
		}

		const result = await response.json();
		if (result.success) {
			console.log('Version created:', result.data);
			return true;
		} else {
			throw new Error(result.message || 'Version creation failed');
		}
	} catch (error) {
		console.error('Error creating file version:', error);
		throw error;
	}
}

export async function refreshCurrentFile() {
	const focusedFile = getFocusedFilePath();
	if (!focusedFile) {
		console.log("No file to refresh");
		return false;
	}

	// Find the active tab and pane
	let activeTab = null;
	let activePane = null;

	for (const pane of editorLayout.panes) {
		if (pane.activeTabId) {
			const tab = pane.tabs.find((t) => t.id === pane.activeTabId);
			if (tab && (tab.filePath === focusedFile || tab.fileName === focusedFile)) {
				activeTab = tab;
				activePane = pane;
				break;
			}
		}
	}

	if (!activeTab || !activePane) {
		console.error("Could not find active tab to refresh");
		return false;
	}

	try {
		// Reload file content
		const response = await fetch(`/view/${focusedFile}`);
		if (!response.ok) {
			throw new Error('Failed to read file content');
		}

		const content = await response.text();
		if (activePane.editor && activeTab.model) {
			// Update editor content through EditorTab
			activeTab.updateContent(content);
			
			// Mark as modified since rollback changed content
			activeTab.modified = true;			
			// Update UI
			state.hasUnsavedChanges = true;
			
			console.log("File refreshed successfully:", focusedFile);
			return true;
		} else {
			throw new Error('Failed to read file');
		}
	} catch (error) {
		console.error("Error refreshing file:", error);
		showSaveNotification("Failed to refresh file: " + error.message, "error");
		return false;
	}
}

function getFocusedFilePath() {
	console.log("getFocusedFilePath called");

	// Find the active tab in the focused pane (for now, use pane 0)
	const focusedPane = editorLayout.panes[0];
	if (focusedPane && focusedPane.activeTabId) {
		console.log("focusedPane.activeTabId:", focusedPane.activeTabId);
		console.log("focusedPane.tabs:", focusedPane.tabs);

		const activeTab = focusedPane.tabs.find((tab) => tab.id === focusedPane.activeTabId);
		const result = activeTab ? activeTab.filePath || activeTab.fileName : null;
		console.log("getFocusedFilePath result:", result);
		return result;
	}
	console.log("No focused pane or activeTabId");
	return null;
}

/**
 * Normalize file path for consistent comparison
 * Removes leading slashes and normalizes separators
 */
function normalizePath(filePath) {
	if (!filePath) return '';
	
	// Remove leading slash if present
	let normalized = filePath.startsWith('/') ? filePath.substring(1) : filePath;
	
	// Normalize path separators and resolve relative paths
	normalized = normalized.replace(/\\/g, '/').replace(/\/+/g, '/');
	
	return normalized;
}

function initializeFileSync() {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const wsUrl = `${protocol}//${window.location.host}/watcher/_sync`;

	console.log("[SYNC] Connecting to file sync WebSocket:", wsUrl);

	try {
		editorSyncWS = new WebSocket(wsUrl);

		editorSyncWS.onopen = () => {
			console.log("[SYNC] File sync WebSocket connected");
			reconnectAttempts = 0;
			
			// If there was a pending watch update, execute it now
			if (pendingWatchUpdate) {
				console.log("[SYNC] Executing pending watch update");
				updateWatchedFiles();
			}
			
			// 원격 커서/선택 영역 추적 시작
			setupRemoteCursorTracking();
		};

		editorSyncWS.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);
				handleSyncMessage(message);
			} catch (error) {
				console.error("[SYNC] Error processing sync message:", error);
			}
		};

		editorSyncWS.onerror = (error) => {
			console.error("[SYNC] WebSocket error:", error);
			// Run quick diagnostics to surface proxy issues
			diagnoseSyncFailure();
			// state.emit('showNotification', { message: "File sync error", type: "error" });
		};

		editorSyncWS.onclose = (event) => {
			console.log("[SYNC] File sync WebSocket disconnected:", event.code, event.reason);
			if (event.code === 1006 || event.code === 1015 || event.code === 1005) {
				// Likely network/handshake/SSL issue; run diagnostics once
				diagnoseSyncFailure();
			}

			if (reconnectAttempts < maxReconnectAttempts) {
				const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
				console.log(
					`[SYNC] Attempting to reconnect in ${delay}ms (attempt ${
						reconnectAttempts + 1
					}/${maxReconnectAttempts})`
				);

				setTimeout(() => {
					reconnectAttempts++;
					initializeFileSync();
				}, delay);
			} else {
				// state.emit('showNotification', { message: "File sync disconnected", type: "warning" });
			}
		};
	} catch (error) {
		console.error("[SYNC] Failed to create WebSocket connection:", error);
	}
}

function handleSyncMessage(message) {
	const {
		type, filePath, content, clientId, files
	} = message;
	console.log("[SYNC] Received message:", type);
	switch (type) {
		case "connection_established":
			console.log("[SYNC] Client ID assigned:", clientId);
			updateWatchedFiles();
			break;

		case "file_changed":
			state.layout.panes.forEach((pane, paneIndex) => {
				pane.tabs.forEach(tab => {
					const normalizedTabPath = normalizePath(tab.filePath);
					const normalizedEventPath = normalizePath(filePath);
					if (normalizedTabPath === normalizedEventPath && !tab.modified) {
						console.log("[SYNC] Updating content for:", tab.filePath);
						
						// Get the DOM pane element to access the Monaco editor
						const $pane = document.querySelector(`.editor-pane[data-pane="${paneIndex}"]`);
						const editor = $pane?.editor;
						
						// Only preserve cursor if this tab is the active tab in this pane
						// and the editor exists
						let position = null;
						let selection = null;
						if (editor && pane.activeTab?.id === tab.id) {
							position = editor.getPosition();
							selection = editor.getSelection();
						}
						
						// Update content (this resets cursor position)
						tab.content = content;
						
						// Restore cursor position if we saved it
						if (editor && position) {
							try {
								editor.setPosition(position);
								if (selection) {
									editor.setSelection(selection);
								}
							} catch (e) {
								// Position no longer valid (e.g., file got shorter)
								console.log("[SYNC] Could not restore cursor position:", e);
							}
						}
					}
				})
			})
			break;

		case "file_deleted":
			state.fileDeleted();
			break;

		case "file_renamed":
			console.log("[SYNC] File renamed:", message.oldPath, "->", message.newPath);
			state.fileRenamed();
			break;

		case "watch_files_confirmed":
			console.log("[SYNC] File watching confirmed for:", files);
			break;

		// 원격 커서/선택 영역 업데이트 처리
		case "remote_cursor_update":
			handleRemoteCursorUpdate(message);
			break;

		case "error":
			console.error("[SYNC] Server error:", message);
			// state.emit('showNotification', { message: `Sync error: ${message}`, type: "error" });
			break;

		default:
			console.warn("[SYNC] Unknown message type:", type);
	}
}

/**
 * 원격 사용자의 커서와 선택 영역 추적 설정
 * 모든 에디터 pane에 커서/선택 영역 변경 리스너를 등록하여 WebSocket으로 전송
 */
function setupRemoteCursorTracking() {
	// editorLayout이 없으면 window.editerState에서 가져오기
	if (!editorLayout && window.editerState) {
		editorLayout = window.editerState.layout;
		console.log("[CURSOR] Got editorLayout from window.editerState", !!editorLayout);
	}

	if (!editorLayout || !editorLayout.panes) {
		console.warn("[CURSOR] editorLayout or panes not available");
		return;
	}

	// 모든 에디터에 커서/선택 영역 변경 리스너 추가
	const domPanes = document.querySelectorAll('.editor-pane');
	
	domPanes.forEach(($pane) => {
		if (!$pane.editor) return;
		
		const paneId = parseInt($pane.getAttribute('data-pane'));
		const pane = editorLayout.panes.find(p => p.id === paneId);
		if (!pane) return;

		// 기존 리스너 제거
		const existingListener = cursorChangeListeners.find(l => l.paneId === paneId);
		if (existingListener && existingListener.dispose) {
			existingListener.dispose();
			const index = cursorChangeListeners.indexOf(existingListener);
			if (index > -1) cursorChangeListeners.splice(index, 1);
		}

		// 커서 위치 변경 감지
		const cursorListener = $pane.editor.onDidChangeCursorPosition((e) => {
			const activeTab = pane.activeTab;
			if (activeTab && activeTab.filePath) {
				sendLocalCursorUpdate($pane.editor, activeTab.filePath);
			}
		});

		// 선택 영역 변경 감지
		const selectionListener = $pane.editor.onDidChangeCursorSelection((e) => {
			const activeTab = pane.activeTab;
			if (activeTab && activeTab.filePath) {
				sendLocalCursorUpdate($pane.editor, activeTab.filePath);
			}
		});

		// 리스너 저장
		cursorChangeListeners.push({
			paneId: paneId,
			dispose: () => {
				cursorListener.dispose();
				selectionListener.dispose();
			}
		});
	});
}

/**
 * 로컬 사용자의 커서와 선택 영역을 WebSocket을 통해 전송
 * @param {Object} editor - Monaco Editor 인스턴스
 * @param {string} filePath - 현재 편집 중인 파일 경로
 */
function sendLocalCursorUpdate(editor, filePath) {
	if (!editorSyncWS || editorSyncWS.readyState !== WebSocket.OPEN) return;

	const position = editor.getPosition();
	const selection = editor.getSelection();

	if (!position) return;

	const message = {
		type: 'cursor_update',
		filePath: normalizePath(filePath),
		position: {
			lineNumber: position.lineNumber,
			column: position.column
		},
		selection: selection && !selection.isEmpty() ? {
			start: {
				lineNumber: selection.startLineNumber,
				column: selection.startColumn
			},
			end: {
				lineNumber: selection.endLineNumber,
				column: selection.endColumn
			}
		} : null
	};

	editorSyncWS.send(JSON.stringify(message));
}

/**
 * 원격 사용자의 커서/선택 영역 업데이트 처리
 * WebSocket으로 받은 메시지를 파싱하여 remoteUserCursor에 저장하고 decoration 업데이트
 * @param {Object} message - {userId, filePath, position, selection, color}
 */
function handleRemoteCursorUpdate(message) {
	const { userId, filePath, position, selection, color } = message;

	console.log("[CURSOR] handleRemoteCursorUpdate:", { userId, filePath, position, selection });

	// 1:1 관계이므로 하나의 원격 사용자만 저장
	remoteUserCursor = {
		userId,
		filePath,
		position,
		selection,
		color: color || '#00ff00' // 기본 색상
	};

	// 모든 pane에서 해당 파일을 찾아서 decoration 업데이트
	updateRemoteCursorDecorations();
}

/**
 * 원격 사용자의 커서와 선택 영역을 Monaco Editor에 decoration으로 표시
 * remoteUserCursor 정보를 기반으로 모든 pane에서 해당 파일의 decoration을 업데이트
 */
function updateRemoteCursorDecorations() {
	if (!remoteUserCursor) {
		console.log("[CURSOR] updateRemoteCursorDecorations: no remoteUserCursor");
		return;
	}

	console.log("[CURSOR] updateRemoteCursorDecorations called", {
		filePath: remoteUserCursor.filePath,
		position: remoteUserCursor.position,
		hasEditorLayout: !!editorLayout,
		hasWindowEditerState: !!window.editerState
	});

	// editorLayout이 없으면 window.editerState에서 가져오기
	if (!editorLayout && window.editerState) {
		editorLayout = window.editerState.layout;
		console.log("[CURSOR] Got editorLayout from window.editerState", !!editorLayout);
	}

	if (!editorLayout || !editorLayout.panes) {
		console.warn("[CURSOR] editorLayout or panes not available", {
			hasEditorLayout: !!editorLayout,
			hasPanes: !!(editorLayout && editorLayout.panes),
			panesCount: editorLayout?.panes?.length
		});
		return;
	}

	console.log("[CURSOR] Processing", editorLayout.panes.length, "panes");

	editorLayout.panes.forEach((pane, paneIndex) => {
		// pane.editor는 DOM 요소에 저장되어 있으므로 DOM에서 찾기
		const paneElement = document.querySelector(`[data-pane="${pane.id}"]`);
		if (!paneElement) {
			console.log(`[CURSOR] Pane ${paneIndex} (id: ${pane.id}): no DOM element found`);
			return;
		}

		if (!paneElement.editor) {
			console.log(`[CURSOR] Pane ${paneIndex} (id: ${pane.id}): no editor instance`);
			return;
		}

		const editor = paneElement.editor;

		// EditorPane 모델은 activeTab getter를 사용합니다
		const activeTab = pane.activeTab;
		const activeTabPath = activeTab ? normalizePath(activeTab.filePath) : null;
		const remotePath = normalizePath(remoteUserCursor.filePath);

		console.log(`[CURSOR] Pane ${paneIndex}:`, {
			hasActiveTab: !!activeTab,
			activeTabPath,
			remotePath,
			match: activeTabPath === remotePath,
			tabsCount: pane.tabs.length,
			tabs: pane.tabs.map(t => ({ id: t.id, filePath: t.filePath, active: t.active }))
		});

		if (!activeTab || activeTabPath !== remotePath) {
			// 현재 pane의 활성 탭이 원격 사용자가 보고 있는 파일이 아니면 decoration 제거
			if (remoteDecorations[paneIndex]) {
				const model = editor.getModel();
				if (model) {
					model.deltaDecorations(remoteDecorations[paneIndex], []);
					remoteDecorations[paneIndex] = [];
				}
			}
			return;
		}

		const model = editor.getModel();
		if (!model) {
			console.log(`[CURSOR] Pane ${paneIndex}: no model`);
			return;
		}

		console.log(`[CURSOR] Pane ${paneIndex}: creating decorations`);

		const decorations = [];

		// 선택 영역 표시 (있는 경우)
		if (remoteUserCursor.selection && 
		    remoteUserCursor.selection.start && 
		    remoteUserCursor.selection.end) {
			const selectionRange = new window.monaco.Range(
				remoteUserCursor.selection.start.lineNumber,
				remoteUserCursor.selection.start.column,
				remoteUserCursor.selection.end.lineNumber,
				remoteUserCursor.selection.end.column
			);

			decorations.push({
				range: selectionRange,
				options: {
					className: 'remote-selection',
					description: 'remote-user-selection',
					hoverMessage: { value: `원격 사용자 선택 영역` },
					inlineClassName: 'remote-selection-inline',
					stickiness: window.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					zIndex: 999,
					overviewRuler: {
						color: remoteUserCursor.color,
						position: window.monaco.editor.OverviewRulerLane.Full
					}
				}
			});
		}

		// 커서 위치 표시
		if (remoteUserCursor.position) {
			const cursorRange = new window.monaco.Range(
				remoteUserCursor.position.lineNumber,
				remoteUserCursor.position.column,
				remoteUserCursor.position.lineNumber,
				remoteUserCursor.position.column + 1
			);

			console.log(`[CURSOR] Pane ${paneIndex}: adding cursor decoration at`, {
				line: remoteUserCursor.position.lineNumber,
				column: remoteUserCursor.position.column
			});

			decorations.push({
				range: cursorRange,
				options: {
					className: 'remote-cursor',
					description: 'remote-user-cursor',
					hoverMessage: { value: `원격 사용자 커서` },
					stickiness: window.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					zIndex: 1000,
					inlineClassName: 'remote-cursor-inline'
				}
			});
		}

		// 기존 decoration 제거하고 새로운 decoration 추가
		const oldDecorations = remoteDecorations[paneIndex] || [];
		console.log(`[CURSOR] Pane ${paneIndex}: applying ${decorations.length} decorations, removing ${oldDecorations.length} old ones`);
		const newDecorationIds = model.deltaDecorations(oldDecorations, decorations);
		remoteDecorations[paneIndex] = newDecorationIds;
		console.log(`[CURSOR] Pane ${paneIndex}: decoration IDs:`, newDecorationIds);
	});
}

function handleFileRename(oldPath, newPath) {
	console.log("[SYNC] Handling file rename:", oldPath, "->", newPath);
	
	// Update all tabs that reference the old file path
	let tabsUpdated = 0;
	
	editorLayout.panes.forEach(pane => {
		pane.tabs.forEach(tab => {
			if (tab.filePath === oldPath) {
				// Update the tab's file path and name
				tab.filePath = newPath;
				tab.fileName = newPath.split('/').pop(); // Extract filename from path
				
				// Update tab display if method exists
				if (tab.updateDisplay) {
					tab.updateDisplay();
				}
				
				// Update tab title in UI
				const tabElement = document.querySelector(`[data-tab-id="${tab.id}"]`);
				if (tabElement) {
					const titleElement = tabElement.querySelector('.tab-title');
					if (titleElement) {
						titleElement.textContent = tab.fileName;
					}
				}
				
				tabsUpdated++;
				console.log("[SYNC] Updated tab:", tab.id, "to new path:", newPath);
			}
		});
	});
	
	if (tabsUpdated > 0) {
		console.log(`[SYNC] Updated ${tabsUpdated} tab(s) for renamed file`);
		
		// Update file watching list to include new path
		updateWatchedFiles();
		
		// Show notification to user
		const oldFileName = oldPath.split('/').pop();
		const newFileName = newPath.split('/').pop();
		showSaveNotification(`File renamed: ${oldFileName} → ${newFileName}`, "info");
	}
}

// Debounce updateWatchedFiles to prevent excessive calls
let updateWatchedFilesTimeout = null;
let pendingWatchUpdate = false;

function updateWatchedFiles() {
	console.log("updateWatchedFiles called");
	if (!editorSyncWS || editorSyncWS.readyState !== WebSocket.OPEN) {
		console.log("[SYNC] WebSocket not ready, will retry when connected");
		pendingWatchUpdate = true;
		return;
	}

	// Clear existing timeout
	if (updateWatchedFilesTimeout) {
		clearTimeout(updateWatchedFilesTimeout);
	}

	// Debounce the update
	updateWatchedFilesTimeout = setTimeout(() => {
		// Get all open files from all panes
		const openFiles = [];
		for (let pane of state.layout.panes) {
			for (let tab of pane.tabs) {
				if (tab.filePath && !openFiles.includes(tab.filePath)) {
					openFiles.push(tab.filePath);
				}
			}
		}

		editorSyncWS.send(
			JSON.stringify({
				type: "watch_files",
				files: openFiles,
			})
		);

		console.log("[SYNC] Updated watched files:", openFiles);
		pendingWatchUpdate = false; // Clear pending flag after successful update
		updateWatchedFilesTimeout = null;
	}, 100);
}

function setupAutosave() {
	setInterval(async () => {
		if (state.preview.collapsed) return;
		if (!state.layout.activePane.activeTab.modified) return;
		state.layout.activePane.activeTab.save();
	}, 2000);
}

function setupEditorsEventListeners() {
	qoomEvent.on('layoutChanged', (e) => {
		const layout = e.detail;
		editorLayout.setLayout(layout);
	});
	
	qoomEvent.on('panesUpdated', () => {
		console.log("Panes updated - watching files:");
		updateWatchedFiles();
	});
	
	qoomEvent.on('panesSet', (e) => {
		const panes = e.detail;
		if (panes.length < 2) {
			state.layout = 'single';
		}
		updateWatchedFiles();
	});

	qoomEvent.on('openFile', (e) => {
		const { fileName, filePath } = e.detail;
		editorLayout.openFile(fileName, filePath);
		// Update file watching when new file is opened
		updateWatchedFiles();
	});

	// Handle openFileAtLine event from explorer/search components
	// Opens a file at a specific line/column when user clicks on search results
	qoomEvent.on('openFileAtLine', (e) => {
		const { fileName, filePath, line, column, searchTerm, searchOptions, matchText } = e.detail;
		if (editorLayout) {
			editorLayout.openFileAtLine(fileName, filePath, line, column, searchTerm, searchOptions, matchText);
			// Update file watching when new file is opened at specific line
			updateWatchedFiles();
		} else {
			// editorLayout may be null if event fires before initialization
			console.warn('editorLayout is not initialized yet');
		}
	});

	qoomEvent.on('closeTabsByFilePath', (e) => {
		const filePath = e.detail;
		editorLayout.closeTabsByFilePath(filePath);
		// Update file watching when tabs are closed
		updateWatchedFiles();
	});

	qoomEvent.on('refreshCurrentFile', () => {
		refreshCurrentFile();
	});

	qoomEvent.on('closeAllOtherTabs', async (e) => {
		const { paneId, keepTabId } = e.detail;
		const closedCount = await editorLayout.closeAllOtherTabs(paneId, keepTabId);
		
		// Emit result back
		const resultEvent = new CustomEvent('closeAllOtherTabsResult', { 
			detail: { paneId, keepTabId, closedCount } 
		});
		window.dispatchEvent(resultEvent);
	});

	qoomEvent.on('editorCreated', () => {
		// 에디터가 생성되면 원격 커서 추적 설정
		setupRemoteCursorTracking();
	});
}

async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="editors.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/editorLayout/frontend/editors.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load Editors CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
	try {
		const response = await fetch("/view/applets/editer/components/editorLayout/frontend/editors.html");
		const html = await response.text();
		const editors = document.querySelector(".editors");
		editors.innerHTML = html;
	} catch (error) {
		console.error("Failed to load editors template:", error);
	}
}

async function initialize(_state) {
	state = _state;
	editorLayout = state.layout; // editorLayout 참조 설정
    await injectCSS();
    await injectHTML();


	await editorPane.initialize(state);
	setupEditorsEventListeners();

	initializeFileSync();
	setupAutosave();
    console.log('Editors initialized');
}

export {
    initialize
}
