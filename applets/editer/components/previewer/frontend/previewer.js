/**
 * File Previewer JavaScript
 *
 * Handles the file preview functionality in the Monaco editor interface.
 */

import { FILE_TYPES_CONFIG, evaluateCondition } from "/view/applets/shared/file-types-config.js";
import qoomEvent from "../../../utils/qoomEvent.js"

("use strict");

let previewContainer = null;
let previewerHeader = null;
let widgetsContainer = null;
let state = null;


function getFileTypeInfo() {
	const ext = getFileExtension();

	for (const [typeName, typeInfo] of Object.entries(FILE_TYPES_CONFIG)) {
		if (typeInfo.extensions.includes(ext)) {
			if (evaluateCondition(typeInfo, state.activeFilePath)) {
				return {
					type: typeName,
					applet: typeInfo.applet,
					config: typeInfo.config,
					...typeInfo,
				};
			}
		}
	}

	return null;
}

function shouldShowPreview() {
	const ext = getFileExtension();
	// Check each file type in shared configuration
	for (const [typeName, typeInfo] of Object.entries(FILE_TYPES_CONFIG)) {
		if (typeInfo.extensions.includes(ext)) {
			// Use shared condition evaluation logic
			if (evaluateCondition(typeInfo, state.activeFilePath)) {
				return true;
			}
		}
	}

	return false;
}

function getFileExtension() {
	const lastDot = state.activeFilePath.lastIndexOf(".");
	return lastDot > 0 ? '.' + state.activeFilePath.split('.').pop() : "";
}

function getBaseName() {
	return state.activeFilePath.split("/").pop();
}

async function getFileDirectory() {
	const filePath = state.activeFilePath;
	const lastSlash = filePath.lastIndexOf('/');
	const relativeDir = lastSlash > 0 ? filePath.substring(0, lastSlash) : '.';
	
	// Get workspace root from server
	try {
		const response = await fetch('/editer/explorer/_api/workspace-info');
		if (response.ok) {
			const json = await response.json();
			const projectRoot = json.data.workspaceRoot;
			return relativeDir === '.' ? projectRoot : `${projectRoot}/${relativeDir}`;
		}
	} catch (error) {
		console.warn('Could not get workspace info from server:', error);
	}
	
	// Fallback to relative path if API call fails
	return relativeDir;
}

async function setupPreviewForTerminal() {
	try {
		const response = await fetch(
			`/editer/previewer/_api/preview/check/${encodeURIComponent(state.activeFilePath)}`
		);
		const result = await response.json();
		if (result.success && result.data.requiresTerminal) {
			showTerminalPreview(result.data.terminalConfig);
		} else {
			showPreviewError("Failed to configure terminal");
		}
	} catch (error) {
		console.error("Error setting up terminal preview:", error);
		showPreviewError("Failed to load terminal preview");
	}
}

function showTerminalPreview(terminalConfig) {
	previewerHeader.classList.remove('hidden');
	previewerHeader.innerHTML = `
		<div class="previewer-title">${terminalConfig.title} - ${terminalConfig.workingDirectory}</div>
		<div class="previewer-actions">
			<button class="preview-btn" id="runScript" title="Run Script">▶️</button>
			<button class="reset-terminal-btn" id="resetTerminal" title="Reset Terminal Session">🔥</button>
			<button class="refresh-preview-btn" id="refreshTerminal" title="Restart Terminal">🔄</button>
			<button class="open-external-btn" id="openFullTerminal" title="Open in New Tab">↗️</button>
		</div>
	`;
	const encodedPath = encodeURIComponent(terminalConfig.workingDirectory);

	previewContainer.innerHTML = `
    <div class="previewer-container terminal-preview">
		<div class="previewer-content terminal-content">
			<iframe src="/terminal?cwd=${encodedPath}" 
					frameborder="0" 
					class="preview-iframe"
					id="terminalIframe">
			</iframe>
		</div>
    </div>
`;

	setupPreviewerEvents()
	setupTerminalControls(encodedPath);
}

async function getRunCommand() {
	const ext = getFileExtension(state.activeFilePath);
	const fileName = getBaseName(state.activeFilePath);
	const fileDir = await getFileDirectory();
	
	// Check if this is a Python project using uv (projects directory with pyproject.toml)
	const isPythonProject = ext === '.py' || ext === '.pyw';
	let useUv = false;
	
	if (isPythonProject) {
		// Check if file is in projects directory and has pyproject.toml
		try {
			const filePath = state.activeFilePath;
			// Normalize path - remove leading slash if present
			const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
			
			// Check if file is in projects directory
			if (normalizedPath.startsWith('projects/')) {
				// Extract directory path (remove filename)
				const dirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
				
				// Check if pyproject.toml exists in the same directory
				const checkResponse = await fetch(`/view/${dirPath}/pyproject.toml`);
				if (checkResponse.ok) {
					useUv = true;
				}
			}
		} catch (error) {
			// If check fails, fall back to regular python command
			// Silently fall back - no need to log for users
		}
	}
	
	// Map file extensions to their run commands
	let runCommand;
	
	if (useUv) {
		// Use uv run for all Python files in uv projects
		// This ensures all code runs in the isolated virtual environment
		runCommand = `uv run ${fileName}`;
	} else {
		const commandMap = {
			'.py': `python3 ${fileName}`,
			'.pyw': `python3 ${fileName}`,
			'.js': `node ${fileName}`,
			'.mjs': `node ${fileName}`,
			'.cjs': `node ${fileName}`,
			'.ts': `npx ts-node ${fileName}`,
			'.tsx': `npx ts-node ${fileName}`,
			'.sh': `./${fileName}`,
			'.bash': `bash ${fileName}`,
			'.zsh': `zsh ${fileName}`,
			'.rs': `cargo run`,
			'.go': `go run ${fileName}`,
			'.java': `javac ${fileName} && java ${fileName.replace('.java', '')}`,
			'.c': `gcc ${fileName} -o ${fileName.replace('.c', '')} && ./${fileName.replace('.c', '')}`,
			'.cpp': `g++ ${fileName} -o ${fileName.replace('.cpp', '')} && ./${fileName.replace('.cpp', '')}`,
			'.rb': `ruby ${fileName}`,
			'.php': `php ${fileName}`,
			'.pl': `perl ${fileName}`,
			'.lua': `lua ${fileName}`,
			'.r': `Rscript ${fileName}`,
			'.swift': `swift ${fileName}`
		};
		runCommand = commandMap[ext] || `echo "No run command configured for ${ext} files"`;
	}
	
	// Combine cd command with run command
	return `cd "${fileDir}" && ${runCommand}`;
}

function sendCommandToTerminal(command, addNewline = true) {
	const iframe = document.getElementById('terminalIframe');
	if (!iframe || !iframe.contentWindow) {
		return;
	}
	
	try {
		// Send a message to the terminal iframe to execute the command
		const commandToSend = addNewline ? command + '\n' : command;
		iframe.contentWindow.postMessage({
			type: 'executeCommand',
			command: commandToSend
		}, '*');
	} catch (error) {
		// Silently handle errors - no need to show technical details to students
	}
}

async function resetTerminalSession() {
	try {
		const response = await fetch('/_api/sessions/reset', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});
		
		const result = await response.json();
		
		if (result.success) {
			// Reload the terminal iframe to reconnect to the new session
			const iframe = document.getElementById('terminalIframe');
			if (iframe) {
				iframe.src = iframe.src;
			}
		}
	} catch (error) {
		// Silently handle errors
	}
}

function setupTerminalControls(encodedPath) {
	const refreshBtn = document.getElementById("refreshTerminal");
	const openBtn = document.getElementById("openFullTerminal");
	const runBtn = document.getElementById('runScript');
	const resetBtn = document.getElementById('resetTerminal');

	refreshBtn.addEventListener("click", () => {
		const iframe = document.getElementById("terminalIframe");
		if (iframe) {
			iframe.src = iframe.src; // Reload iframe
		}
	});

	openBtn.addEventListener("click", () => {
		window.open(`/terminal?cwd=${encodedPath}`, "_blank");
	});

	runBtn.addEventListener('click', async () => {
		// Send ctrl+c to stop current running process first (without newline)
		sendCommandToTerminal('\x03', false);
		// Wait for a short delay and then execute cd command
		setTimeout(async () => {
			const command = await getRunCommand();
			sendCommandToTerminal(command);
		}, 200);
	});

	resetBtn.addEventListener('click', () => {
		resetTerminalSession();
	});

}

function setupPreviewForRenderer() {
	const iframe = document.createElement("iframe");
	iframe.className = "preview-iframe";
	iframe.src = `/render/${state.activeFilePath}`;

	iframe.onload = () => {
	};

	iframe.onerror = () => {
		console.error("Failed to load preview");
		showPreviewError("Failed to load preview");
	};
	previewerHeader.classList.remove('hidden');
	previewerHeader.innerHTML = `
		<div class="previewer-title">${state.activeFilePath}</div>
		<div class="previewer-actions">
			<button class="refresh-preview-btn" title="Refresh Preview">🔄</button>
			<button class="open-external-btn" title="Open in New Tab">🔗</button>
		</div>
	`;

	previewContainer.innerHTML = "";
	previewContainer.appendChild(iframe);
	setupRendererControls();
}

function setupRendererControls() {
	const refreshBtn = widgetsContainer.querySelector(".refresh-preview-btn");
	const openExternalBtn = widgetsContainer.querySelector(".open-external-btn");
	refreshBtn.addEventListener("click", () => {
		updatePreview();
	});
	openExternalBtn.addEventListener("click", () => {
		window.open(`/render/${state.activeFilePath}`, "_blank");
	});
}

function showNoPreview() {

}

function showPreviewError(message) {
	if (!previewContainer) return;

	previewerHeader.classList.add('hidden');
	previewContainer.innerHTML = `
        <div class="preview-error">
            <h4>Preview Error</h4>
            <p>${message}</p>
        </div>
    `;
}

function setupPreviewerEvents() {
	qoomEvent.on('activeFilePathChanged', updatePreview);
	qoomEvent.on('previewPanelCollapsed', updatePreview);
	qoomEvent.on('panesUpdated', updatePreview);

	qoomEvent.on('addNewTab', updatePreview);
    qoomEvent.on('activeTabChangedInPane', updatePreview);
}

async function updatePreview() {
	if(state.previewPanelHidden) return;
	if(state.preview.collapsed) return;


	const fileTypeInfo = getFileTypeInfo();

	if (!fileTypeInfo) {
		setupPreviewForRenderer();
		return;
	}

	if (fileTypeInfo.applet === "terminaler") {
		await setupPreviewForTerminal();
	} else if (fileTypeInfo.applet === "renderer") {
		setupPreviewForRenderer();
	} else {
		return showPreviewError(`Unsupported applet: ${fileTypeInfo.applet}`);
	}
}

async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="previewer.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/previewer/frontend/previewer.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load Preview CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
    try {
		const response = await fetch("/view/applets/editer/components/previewer/frontend/previewer.html");
		const html = await response.text();
		widgetsContainer = document.querySelector(".widgets-preview");
		widgetsContainer.innerHTML = html;
		previewContainer = widgetsContainer.querySelector(".previewer-content");
		previewerHeader = widgetsContainer.querySelector(".previewer-header");
		
	} catch (error) {
		console.error("Failed to load previewer template:", error);
	}
}

async function initialize(_state) {
	state = _state;
    await injectCSS();
    await injectHTML(); 

	setupPreviewerEvents();
	updatePreview();
}

export {
    initialize
}
