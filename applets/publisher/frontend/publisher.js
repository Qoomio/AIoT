import qoomEvent from "../../editer/utils/qoomEvent.js";

let state = null;

const assets = {
    close: "/view/applets/publisher/assets/ab1d94399957e76f55573113ee2b580c751a8270.svg",
    github: "/view/applets/publisher/assets/773671a5ff970d91c6801fbe611612367fc4af81.svg",
    githubLarge: "/view/applets/publisher/assets/eb0cc50cd47088ce12aa10818e1db911a2fa9bdc.svg",
    qoom: "/view/favicon.png",
    chevronRight: "/view/applets/publisher/assets/882dce62388e0cc724297c22ea144b8571d6c810.svg",
    chevronDown: "/view/applets/publisher/assets/565cef13462393062c83d6e2bf3d9db43136a820.svg",
    upload: "/view/applets/publisher/assets/8038f704c6498b79c830e5d3927c242977fbbcb5.svg"
};

const html2CanvasCdn = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
let html2canvasCache = null;

function loadHtml2Canvas(targetDocument) {
    const existing = targetDocument.defaultView?.html2canvas;
    if (existing) {
        return Promise.resolve(existing);
    }
    
    // 캐시된 라이브러리 사용
    if (html2canvasCache) {
        return Promise.resolve(html2canvasCache);
    }

    return new Promise((resolve, reject) => {
        const script = targetDocument.createElement("script");
        script.src = html2CanvasCdn;
        script.async = true;
        script.onload = () => {
            html2canvasCache = targetDocument.defaultView?.html2canvas;
            resolve(html2canvasCache);
        };
        script.onerror = () => reject(new Error("Failed to load screenshot library"));
        targetDocument.head.appendChild(script);
    });
}

async function captureProjectScreenshot(projectUrl, onProgress) {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:1280px;height:720px;border:0;visibility:hidden;";
    document.body.appendChild(iframe);

    const cleanup = () => {
        if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
        }
    };

    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Screenshot timed out"));
            }, 15000);

            iframe.onload = () => {
                clearTimeout(timeout);
                resolve();
            };
            iframe.onerror = () => {
                clearTimeout(timeout);
                reject(new Error("Failed to load project preview"));
            };

            iframe.src = projectUrl;
        });

        const iframeDocument = iframe.contentDocument;
        const iframeWindow = iframe.contentWindow;

        if (!iframeDocument || !iframeWindow) {
            throw new Error("Preview not available");
        }

        if (iframeDocument.fonts?.ready) {
            await iframeDocument.fonts.ready.catch(() => undefined);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
        
        onProgress?.(25); // 25% 진행률

        const html2canvas = await loadHtml2Canvas(iframeDocument);
        if (!html2canvas) {
            throw new Error("Screenshot library unavailable");
        }
        
        onProgress?.(50); // 50% 진행률

        const canvas = await html2canvas(iframeDocument.body, {
            useCORS: true,
            backgroundColor: "#ffffff",
            windowWidth: iframeWindow.innerWidth,
            windowHeight: iframeWindow.innerHeight,
            scrollX: 0,
            scrollY: 0,
            scale: 1
        });
        
        onProgress?.(90); // 90% 진행률
        return canvas.toDataURL("image/png", 1.0);
    } finally {
        cleanup();
    }
}

/**
 * 스켈레톤 로더 생성
 * @param {HTMLElement} container - 로더를 표시할 컨테이너
 * @returns {HTMLElement} 스켈레톤 로더 요소
 */
function createSkeletonLoader(container) {
    const skeleton = document.createElement("div");
    skeleton.className = "publisher-skeleton-loader";
    skeleton.innerHTML = `
        <div class="publisher-skeleton-line publisher-skeleton-line-1"></div>
        <div class="publisher-skeleton-line publisher-skeleton-line-2"></div>
        <div class="publisher-skeleton-line publisher-skeleton-line-3"></div>
    `;
    container.appendChild(skeleton);
    return skeleton;
}

/**
 * 스켈레톤 로더 제거
 * @param {HTMLElement} skeleton - 제거할 스켈레톤 로더
 */
function removeSkeletonLoader(skeleton) {
    if (skeleton && skeleton.parentNode) {
        skeleton.remove();
    }
}

/**
 * 스켈레톤 로더 진행률 업데이트
 * @param {HTMLElement} skeleton - 스켈레톤 로더
 * @param {number} progress - 진행률 (0-100)
 */
function updateSkeletonProgress(skeleton, progress) {
    if (skeleton) {
        const lines = skeleton.querySelectorAll(".publisher-skeleton-line");
        lines.forEach((line, index) => {
            const delay = (index * 20);
            const animationProgress = Math.max(0, progress - delay);
            line.style.setProperty("--progress", `${animationProgress}%`);
        });
    }
}

/**
 * 진행률 모달 생성
 * @param {string} title - 모달 제목
 * @returns {HTMLElement} 진행률 모달
 */
function createProgressModal(title) {
    const modal = document.createElement("div");
    modal.className = "publisher-modal publisher-progress-modal";
    modal.innerHTML = `
        <div class="publisher-modal-content publisher-modal-content--sm">
            <div class="publisher-modal-header">
                <h3 class="publisher-modal-title">${title}</h3>
            </div>
            <div class="publisher-modal-body publisher-modal-body--center">
                <div class="publisher-progress-container">
                    <div class="publisher-progress-bar">
                        <div class="publisher-progress-fill" style="width: 10%"></div>
                    </div>
                    <div class="publisher-progress-text">
                        <span class="publisher-progress-label">Preparing...</span>
                        <span class="publisher-progress-value">10%</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

/**
 * 진행률 바 업데이트
 * @param {HTMLElement} modal - 진행률 모달
 * @param {number} progress - 진행률 (0-100)
 * @param {string} label - 진행 상태 레이블
 */
function updateProgressBar(modal, progress, label) {
    if (!modal) return;
    
    const fill = modal.querySelector(".publisher-progress-fill");
    const value = modal.querySelector(".publisher-progress-value");
    const labelEl = modal.querySelector(".publisher-progress-label");
    
    if (fill) fill.style.width = `${progress}%`;
    if (value) value.textContent = `${progress}%`;
    if (labelEl) labelEl.textContent = label;
}

/**
 * 진행률 모달 제거
 * @param {HTMLElement} modal - 제거할 모달
 */
function removeProgressModal(modal) {
    if (modal && modal.parentNode) {
        modal.classList.add("is-closing");
        setTimeout(() => modal.remove(), 300);
    }
}

async function resolveProjectPreviewUrl(projectPath) {
    const normalizedPath = projectPath.replace(/^\//, "");
    const isFilePath = /[^/]+\.[a-z0-9]+$/i.test(normalizedPath);
    const candidates = isFilePath
        ? [
            `/render/${normalizedPath}`
        ]
        : [
            `/view/${normalizedPath}/index.html`,
            `/view/${normalizedPath}/public/index.html`,
            `/view/${normalizedPath}/dist/index.html`,
            `/render/${normalizedPath}/index.html`
        ];

    for (const url of candidates) {
        try {
            const response = await fetch(url, { method: "GET" });
            if (response.ok) {
                return url;
            }
        } catch (error) {
            continue;
        }
    }

    throw new Error("Preview page not found");
}

/**
 * 토스트 메시지 표시
 * @param {string} message - 표시할 메시지
 * @param {string} type - 메시지 타입 (info, success, error, warning)
 * @param {number} duration - 표시 시간 (밀리초)
 */
function showMessage(message, type = "info", duration = 3000) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `publisher-toast publisher-toast-${type}`;
    messageDiv.textContent = message;
    messageDiv.setAttribute("role", "alert");
    document.body.appendChild(messageDiv);
    
    // 애니메이션 시작
    messageDiv.offsetHeight; // reflow 강제 (애니메이션 트리거)
    messageDiv.classList.add("is-visible");
    
    const timeout = setTimeout(() => {
        messageDiv.classList.remove("is-visible");
        setTimeout(() => messageDiv.remove(), 300);
    }, duration);
    
    return () => clearTimeout(timeout);
}

function getProjectFolderPath(path, isDirectory) {
    const normalizedPath = path.startsWith("/") ? path.substring(1) : path;
    
    // 파일인 경우 디렉토리 부분만, 디렉토리인 경우 전체 경로 반환
    if (!isDirectory) {
        const parts = normalizedPath.split("/");
        if (parts.length === 1) {
            return null; // 루트에 있는 파일은 퍼블리시 불가
        }
        parts.pop(); // 파일명 제거
        return parts.join("/");
    }
    
    return normalizedPath;
}

function removeModal(id) {
    const existing = document.getElementById(id);
    if (existing) {
        existing.remove();
    }
}

function createModal(id, contentClass, innerHtml) {
    removeModal(id);
    const modal = document.createElement("div");
    modal.id = id;
    modal.className = "publisher-modal";
    modal.innerHTML = `<div class="publisher-modal-content ${contentClass}">${innerHtml}</div>`;
    document.body.appendChild(modal);
    return modal;
}

function bindModalClose(modal, closeSelector) {
    const closeButton = modal.querySelector(closeSelector);
    const closeModal = () => {
        modal.remove();
    };

    if (closeButton) {
        closeButton.addEventListener("click", closeModal);
    }

    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    const escHandler = (event) => {
        if (event.key === "Escape") {
            closeModal();
            document.removeEventListener("keydown", escHandler);
        }
    };
    document.addEventListener("keydown", escHandler);

    return closeModal;
}

function showPublishStartModal(path, isDirectory) {
    const projectFolderPath = getProjectFolderPath(path, isDirectory);
    if (!projectFolderPath) {
        showMessage("Project folder not found.", "error");
        return;
    }

    const projectName = projectFolderPath.split("/").pop() || projectFolderPath;
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

    const modal = createModal(
        "publisher-modal-start",
        "publisher-modal-content--md",
        `
        <div class="publisher-modal-header">
            <h3 class="publisher-modal-title">Publish Project</h3>
            <button type="button" class="publisher-close-btn" aria-label="Close">
                <img src="${assets.close}" alt="" />
            </button>
        </div>
        <div class="publisher-modal-body publisher-modal-body--stack">
            <div class="publisher-project-card">
                <span class="publisher-project-label">PROJECT:</span>
                <span class="publisher-project-name">${projectName}</span>
            </div>
            <p class="publisher-subtitle">Choose where to publish</p>
            <div class="publisher-options-list">
                <button type="button" class="publisher-option-card is-primary" data-option="github">
                    <span class="publisher-option-icon">
                        <img src="${assets.github}" alt="" />
                    </span>
                    <span class="publisher-option-text">
                        <span class="publisher-option-title">Publish to GitHub</span>
                        <span class="publisher-option-description">Push your project to a new or existing GitHub repository. Great for version control and collaboration.</span>
                    </span>
                    <span class="publisher-option-arrow">
                        <img src="${assets.chevronRight}" alt="" />
                    </span>
                </button>
                <button type="button" class="publisher-option-card" data-option="qoom">
                    <span class="publisher-option-icon">
                        <img src="${assets.qoom}" alt="" />
                    </span>
                    <span class="publisher-option-text">
                        <span class="publisher-option-title">Publish to Qoom Community</span>
                        <span class="publisher-option-description">Share your project with the Qoom community. Make it discoverable and get feedback.</span>
                    </span>
                    <span class="publisher-option-arrow">
                        <img src="${assets.chevronRight}" alt="" />
                    </span>
                </button>
            </div>
        </div>
        <div class="publisher-modal-footer publisher-modal-footer--end">
            <button type="button" class="publisher-btn publisher-btn-secondary" data-action="cancel">Cancel</button>
        </div>
        `
    );

    const closeModal = bindModalClose(modal, ".publisher-close-btn");

    modal.querySelector('[data-action="cancel"]').addEventListener("click", closeModal);

    modal.querySelectorAll(".publisher-option-card").forEach((button) => {
        button.addEventListener("click", () => {
            const option = button.dataset.option;
            closeModal();
            if (option === "github") {
                handleGitHubPublish(projectFolderPath);
            } else {
                showQoomPublishModal(projectFolderPath, normalizedPath);
            }
        });
    });
}

async function handleGitHubPublish(projectFolderPath) {
    let hasToken = false;

    try {
        const repoListResponse = await fetch("/edit/publisher/_api/github/repos");
        if (repoListResponse.ok) {
            const repoData = await repoListResponse.json();
            if (repoData.success) {
                hasToken = true;
            }
        }
    } catch (error) {
        hasToken = false;
    }

    if (!hasToken) {
        showConnectToGitHubModal(projectFolderPath);
        return;
    }

    showGitHubPublishModal(projectFolderPath);
}

function showConnectToGitHubModal(projectFolderPath) {
    const modal = createModal(
        "publisher-modal-connect",
        "publisher-modal-content--sm",
        `
        <div class="publisher-modal-header">
            <h3 class="publisher-modal-title">Connect to GitHub</h3>
            <button type="button" class="publisher-close-btn" aria-label="Close">
                <img src="${assets.close}" alt="" />
            </button>
        </div>
        <div class="publisher-modal-body publisher-modal-body--center">
            <div class="publisher-icon-stack">
                <img src="${assets.githubLarge}" alt="" />
            </div>
            <p class="publisher-center-title">Authentication Required</p>
            <p class="publisher-center-text">To publish projects to GitHub, you need to connect your GitHub account.</p>
            <button type="button" class="publisher-btn publisher-btn-primary" data-action="start-auth" style="margin: 20px auto; display: block; padding: 12px 24px;">Start GitHub Login</button>
            <div data-role="auth-step" style="display: none; margin-top: 20px;">
                <div class="publisher-code-display">
                    <p class="publisher-step-text">1. Copy this code:</p>
                    <span class="publisher-user-code" data-role="user-code">----</span>
                    <p class="publisher-step-text" style="margin-top: 20px;">2. Click below to enter the code on GitHub:</p>
                    <a href="#" target="_blank" class="publisher-btn publisher-btn-outline" data-role="verification-link">Open GitHub Verification</a>
                </div>
                <p data-role="status-msg" class="publisher-status-msg">Waiting for authentication...</p>
            </div>
        </div>
        <div class="publisher-modal-footer">
            <button type="button" class="publisher-btn publisher-btn-secondary" data-action="logout" data-role="logout-btn">Logout</button>
            <button type="button" class="publisher-btn publisher-btn-secondary" data-action="cancel">Cancel</button>
        </div>
        `
    );

    const closeModal = bindModalClose(modal, ".publisher-close-btn");
    modal.querySelector('[data-action="cancel"]').addEventListener("click", closeModal);
    
    const logoutBtn = modal.querySelector('[data-action="logout"]');
    logoutBtn.addEventListener("click", async () => {
        try {
            await fetch("/edit/publisher/_api/auth/github/logout", { method: "POST" });
            closeModal();
            showConnectToGitHubModal(projectFolderPath);
        } catch (error) {
            showMessage("Logout failed: " + error.message, "error");
        }
    });

    const startAuthBtn = modal.querySelector('[data-action="start-auth"]');
    const authStep = modal.querySelector('[data-role="auth-step"]');
    const userCodeEl = modal.querySelector('[data-role="user-code"]');
    const verificationLink = modal.querySelector('[data-role="verification-link"]');
    const statusMsg = modal.querySelector('[data-role="status-msg"]');
    
    // Logout button already visible in the footer

    startAuthBtn.addEventListener("click", async () => {
        startAuthBtn.disabled = true;
        startAuthBtn.textContent = "Requesting code...";

        try {
            const res = await fetch("/edit/publisher/_api/auth/github/device/code", { method: "POST" });
            const json = await res.json();

            if (!json.success) throw new Error(json.message || "Failed to start authentication");

            const { user_code, verification_uri, device_code, interval } = json.data;

            userCodeEl.textContent = user_code;
            verificationLink.href = verification_uri;
            startAuthBtn.style.display = "none";
            authStep.style.display = "block";

            pollGitHubAuth(device_code, interval || 5, statusMsg, () => {
                closeModal();
                showGitHubPublishModal(projectFolderPath);
            });
        } catch (e) {
            showMessage("Authentication failed: " + e.message, "error");
            startAuthBtn.disabled = false;
            startAuthBtn.textContent = "Start GitHub Login";
        }
    });
}

async function pollGitHubAuth(deviceCode, interval, statusMsg, onSuccess) {
    let currentInterval = interval;

    const check = async () => {
        try {
            const res = await fetch("/edit/publisher/_api/auth/github/device/poll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_code: deviceCode })
            });
            const json = await res.json();
            const data = json.data || {};

            if (json.success && data.status === "complete") {
                statusMsg.textContent = "✅ Authentication successful!";
                statusMsg.style.color = "var(--brand-primary)";
                setTimeout(onSuccess, 1000);
            } else if (data.status === "slow_down") {
                if (data.interval) {
                    currentInterval = data.interval;
                } else {
                    currentInterval += 5;
                }
                statusMsg.textContent = `⏳ Waiting... (${currentInterval}s interval)`;
                setTimeout(check, currentInterval * 1000);
            } else if (data.status === "pending") {
                statusMsg.textContent = "⏳ Waiting for you to authorize on GitHub...";
                setTimeout(check, currentInterval * 1000);
            } else {
                statusMsg.textContent = "❌ " + (data.error_description || "Authentication failed");
                statusMsg.style.color = "#ef4444";
            }
        } catch (e) {
            setTimeout(check, currentInterval * 1000);
        }
    };

    check();
}

async function showGitHubPublishModal(projectFolderPath) {
    const projectName = projectFolderPath.split("/").pop();
    let repoList = [];

    try {
        const repoListResponse = await fetch("/edit/publisher/_api/github/repos");
        if (repoListResponse.ok) {
            const repoData = await repoListResponse.json();
            repoList = repoData.data?.gitRepoList || [];
        }
    } catch (error) {
        repoList = [];
    }

    const repoOptions = repoList.length
        ? repoList.map((repo) => `<option value="${repo}">${repo}</option>`).join("")
        : "<option value=\"\" disabled>No repositories found</option>";

    const modal = createModal(
        "publisher-modal-github",
        "publisher-modal-content--lg",
        `
        <div class="publisher-modal-header">
            <h3 class="publisher-modal-title">Publish to GitHub</h3>
            <button type="button" class="publisher-btn publisher-btn-secondary" data-action="logout" style="margin-left: auto; padding: 6px 12px; font-size: 13px; margin-right: 12px;">Logout</button>
            <button type="button" class="publisher-close-btn" aria-label="Close">
                <img src="${assets.close}" alt="" />
            </button>
        </div>
        <div class="publisher-modal-body">
            <div class="publisher-repo-section">
                    <p class="publisher-subtitle">Choose how you want to publish:</p>
                <div class="publisher-repo-options">
                    <div class="publisher-repo-card is-selected" data-option="existing">
                        <span class="publisher-radio"><span class="publisher-radio-dot"></span></span>
                        <div class="publisher-option-text">
                            <p class="publisher-repo-title">Publish to Existing Repository</p>
                                <p class="publisher-repo-description">Pick a repo you already own. We'll push your project to it.</p>
                            <div class="publisher-field">
                                <span class="publisher-field-label">Select Repository</span>
                                <div class="publisher-select-wrap">
                                    <select class="publisher-select" data-role="repo-select">
                                        <option value="" selected disabled>Choose a repository...</option>
                                        ${repoOptions}
                                    </select>
                                    <img class="publisher-select-icon" src="${assets.chevronDown}" alt="" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="publisher-repo-card" data-option="new">
                        <span class="publisher-radio"></span>
                        <div class="publisher-option-text">
                            <p class="publisher-repo-title">Create New Repository</p>
                            <p class="publisher-repo-description">Create a brand new repository on GitHub.</p>
                            <div class="publisher-field">
                                <span class="publisher-field-label">Repository Name</span>
                                <input type="text" class="publisher-input" placeholder="my-awesome-project" value="${projectName}" data-role="new-repo-name" />
                            </div>
                            <div class="publisher-field">
                                <span class="publisher-field-label">Description (Optional)</span>
                                <input type="text" class="publisher-input" placeholder="A brief description of your project" data-role="new-repo-desc" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="publisher-modal-footer">
            <button type="button" class="publisher-btn publisher-btn-secondary" data-action="cancel">Cancel</button>
            <button type="button" class="publisher-btn publisher-btn-primary" data-action="publish" disabled>Publish</button>
        </div>
        `
    );

    const closeModal = bindModalClose(modal, ".publisher-close-btn");

    const optionCards = modal.querySelectorAll(".publisher-repo-card");
    const publishButton = modal.querySelector('[data-action="publish"]');
    
    // Logout button handler
    modal.querySelector('[data-action="logout"]').addEventListener("click", async () => {
        try {
            await fetch("/edit/publisher/_api/auth/github/logout", { method: "POST" });
            closeModal();
            showMessage("Logged out successfully", "success");
            showConnectToGitHubModal(projectFolderPath);
        } catch (error) {
            showMessage("Logout failed: " + error.message, "error");
        }
    });
    
    optionCards.forEach((card) => {
        card.addEventListener("click", () => {
            optionCards.forEach((item) => item.classList.remove("is-selected"));
            card.classList.add("is-selected");
            updatePublishState();
        });
    });

    modal.querySelector('[data-action="cancel"]').addEventListener("click", closeModal);
    
    const repoSelect = modal.querySelector('[data-role="repo-select"]');
    const newRepoNameInput = modal.querySelector('[data-role="new-repo-name"]');
    
    const updatePublishState = () => {
        const selectedCard = modal.querySelector(".publisher-repo-card.is-selected");
        const option = selectedCard ? selectedCard.dataset.option : "existing";
        if (option === "existing") {
            publishButton.disabled = !repoSelect.value;
        } else {
            publishButton.disabled = !newRepoNameInput.value.trim();
        }
    };

    repoSelect.addEventListener("change", updatePublishState);
    newRepoNameInput.addEventListener("input", updatePublishState);

    publishButton.addEventListener("click", async () => {
        if (publishButton.dataset.inflight === "1") {
            return;
        }
        publishButton.dataset.inflight = "1";

        const selectedCard = modal.querySelector(".publisher-repo-card.is-selected");
        const option = selectedCard ? selectedCard.dataset.option : "existing";
        let repoName = projectName;

        if (option === "existing") {
            const select = modal.querySelector('[data-role="repo-select"]');
            repoName = select.value;
            if (!repoName) {
                showMessage("Please select a repository.", "error");
                return;
            }
        } else {
            repoName = modal.querySelector('[data-role="new-repo-name"]').value.trim();
            const repoDesc = modal.querySelector('[data-role="new-repo-desc"]').value.trim();
            
            if (!repoName) {
                showMessage("Please enter a repository name.", "error");
                return;
            }
            
            const progressModal = createProgressModal("Creating Repository");
            try {
                updateProgressBar(progressModal, 30, "Creating new repository...");
                const createRes = await fetch("/edit/publisher/_api/github/repos", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        repoName: repoName, 
                        isPrivate: false,
                        description: repoDesc || undefined
                    })
                });
                
                if (!createRes.ok) {
                    removeProgressModal(progressModal);
                    const errorData = await createRes.json().catch(() => ({ message: `HTTP ${createRes.status}` }));
                    throw new Error(errorData.message || errorData.error || "Failed to create repository");
                }
                
                const createData = await createRes.json();
                
                if (!createData.success) {
                    removeProgressModal(progressModal);
                    throw new Error(createData.message || createData.error || "Failed to create repository");
                }
                removeProgressModal(progressModal);
            } catch (error) {
                showMessage(`Repository creation failed: ${error.message}`, "error");
                return;
            }
        }

        closeModal();
        
        const progressModal = createProgressModal("Publishing to GitHub");

        try {
            updateProgressBar(progressModal, 10, "Preparing files...");
            
            const payload = {
                folder: projectFolderPath,
                repoName: repoName,
                commitMessage: "Published from Qoom",
                overwrite: true
            };
            
            console.log("[Publisher] Publishing to GitHub:", payload);
            console.log("[Publisher] Full path:", projectFolderPath);
            
            updateProgressBar(progressModal, 20, "Uploading to GitHub...");
            
            // Large projects can exceed 30s; avoid user retry while server is still processing.
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            
            const response = await fetch("/edit/publisher/_api/publish/github", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                updateProgressBar(progressModal, 100, "Failed!");
                removeProgressModal(progressModal);
                const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
                throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            updateProgressBar(progressModal, 75, "Uploading files...");
            const data = await response.json();
            
            console.log("[Publisher] Upload response:", data);
            
            if (data.success) {
                const repoUrl = data.data?.repoUrl;
                const pushedFiles = data.data?.pushedFiles || 0;
                const commitSha = data.data?.commitSha;
                
                updateProgressBar(progressModal, 100, "Published!");
                setTimeout(() => removeProgressModal(progressModal), 1000);
                const commitText = commitSha ? ` (commit ${commitSha.slice(0, 7)})` : "";
                showMessage(`Published! ${pushedFiles} files uploaded${commitText}`, "success");
                
                if (repoUrl) {
                    window.open(repoUrl, "_blank");
                }
            } else {
                updateProgressBar(progressModal, 100, "Failed!");
                setTimeout(() => removeProgressModal(progressModal), 1000);
                throw new Error(data.error || data.message || "Failed to publish to GitHub");
            }
        } catch (error) {
            console.error("[Publisher] Upload error:", error);
            removeProgressModal(progressModal);
            
            if (error.name === 'AbortError') {
                showMessage("Upload timed out (120s). The server might still be processing. Check GitHub before retrying.", "error");
            } else if (!navigator.onLine) {
                showMessage("No internet connection", "error");
            } else {
                showMessage(`Publish failed: ${error.message}`, "error");
            }
        } finally {
            publishButton.dataset.inflight = "0";
        }
    });

    repoSelect.addEventListener("change", () => {
        if (repoSelect.value) {
            repoSelect.classList.add("is-filled");
        } else {
            repoSelect.classList.remove("is-filled");
        }
        updatePublishState();
    });

    updatePublishState();
}

function showQoomPublishModal(projectFolderPath, projectPathOverride) {
    const projectName = projectFolderPath.split("/").pop();
    let coverImage = null;

    const modal = createModal(
        "publisher-modal-qoom",
        "publisher-modal-content--lg",
        `
        <div class="publisher-modal-header">
            <h3 class="publisher-modal-title">Publish to Qoom Community</h3>
            <button type="button" class="publisher-close-btn" aria-label="Close">
                <img src="${assets.close}" alt="" />
            </button>
        </div>
        <div class="publisher-modal-body">
            <div class="publisher-form">
                <div class="publisher-field">
                    <div class="publisher-field">
                    <div class="publisher-label-row">
                        <span class="publisher-label">Project Title</span>
                        <span class="publisher-required">*</span>
                    </div>
                    <input type="text" class="publisher-input" value="${projectName}" data-role="qoom-title" />
                </div>
                <div class="publisher-field">
                    <div class="publisher-label-row">
                        <span class="publisher-label">Description</span>
                        <span class="publisher-required">*</span>
                    </div>
                    <textarea class="publisher-textarea" placeholder="A short, clear description of your project." data-role="qoom-description"></textarea>
                </div>
                <div class="publisher-field">
                    <div class="publisher-label-row">
                        <span class="publisher-label">Cover Image</span>
                            <span class="publisher-optional">Optional</span>
                    </div>
                    <div class="publisher-cover-card">
                        <div class="publisher-cover-preview" data-role="qoom-cover-preview">
                            <span class="publisher-cover-placeholder">Add a cover image</span>
                        </div>
                        <button type="button" class="publisher-cover-btn" data-action="cover-screenshot">Take a Screenshot</button>
                        <button type="button" class="publisher-cover-link" data-action="cover-select">or Select a File</button>
                        <input type="file" data-role="qoom-cover-input" accept="image/*" style="display:none" />
                    </div>
                        <span class="publisher-hint">Optional. A cover image helps your project stand out.</span>
                </div>
            </div>
        </div>
        <div class="publisher-modal-footer">
            <button type="button" class="publisher-btn publisher-btn-secondary" data-action="cancel">Cancel</button>
                <button type="button" class="publisher-btn publisher-btn-primary" data-action="publish" disabled>Publish</button>
        </div>
        `
    );

    const closeModal = bindModalClose(modal, ".publisher-close-btn");

    const coverInput = modal.querySelector('[data-role="qoom-cover-input"]');
    const coverPreview = modal.querySelector('[data-role="qoom-cover-preview"]');
    const coverSelect = modal.querySelector('[data-action="cover-select"]');
    const coverScreenshot = modal.querySelector('[data-action="cover-screenshot"]');

    const setCoverPreview = (src) => {
        coverPreview.style.backgroundImage = `url('${src}')`;
        coverPreview.classList.add('is-filled');
        coverPreview.textContent = '';
    };

    coverSelect.addEventListener('click', () => {
        coverInput.click();
    });

    coverInput.addEventListener("change", () => {
        if (coverInput.files && coverInput.files[0]) {
            const file = coverInput.files[0];
            coverImage = { type: 'file', file };
            const previewUrl = URL.createObjectURL(file);
            setCoverPreview(previewUrl);
        }
    });

    coverScreenshot.addEventListener('click', async () => {
        coverScreenshot.disabled = true;
        const originalText = coverScreenshot.textContent;
        
        // 스켈레톤 로더 추가
        const skeleton = createSkeletonLoader(coverPreview);
        
        try {
            coverScreenshot.textContent = 'Taking Screenshot...';
            const normalizedPath = projectPathOverride ? projectPathOverride.replace(/^\//, "") : projectFolderPath;
            const projectUrl = await resolveProjectPreviewUrl(normalizedPath);
            const dataUrl = await captureProjectScreenshot(projectUrl, (progress) => {
                updateSkeletonProgress(skeleton, progress);
            });
            removeSkeletonLoader(skeleton);
            coverImage = { type: 'dataUrl', dataUrl };
            setCoverPreview(dataUrl);
        } catch (error) {
            removeSkeletonLoader(skeleton);
            showMessage(`Screenshot failed: ${error.message}`, 'error');
        } finally {
            coverScreenshot.disabled = false;
            coverScreenshot.textContent = originalText;
        }
    });

    const qoomPublishButton = modal.querySelector('[data-action="publish"]');
    const qoomTitleInput = modal.querySelector('[data-role="qoom-title"]');
    const qoomDescriptionInput = modal.querySelector('[data-role="qoom-description"]');

    const updateQoomPublishState = () => {
        const title = qoomTitleInput.value.trim();
        const description = qoomDescriptionInput.value.trim();
        qoomPublishButton.disabled = !(title && description);
    };

    qoomTitleInput.addEventListener("input", updateQoomPublishState);
    qoomDescriptionInput.addEventListener("input", updateQoomPublishState);

    modal.querySelector('[data-action="cancel"]').addEventListener("click", closeModal);
    qoomPublishButton.addEventListener("click", async () => {
        const title = modal.querySelector('[data-role="qoom-title"]').value.trim();
        const description = modal.querySelector('[data-role="qoom-description"]').value.trim();
        if (!title) {
            showMessage("Please enter a project title.", "error");
            return;
        }

        if (!description) {
            showMessage("Please enter a project description.", "error");
            return;
        }

        closeModal();
        await handleQoomPublish(projectFolderPath, title, description, coverImage);
    });

    updateQoomPublishState();
}

async function handleQoomPublish(projectFolderPath, title, description, coverImage) {
    const progressModal = createProgressModal("Publishing to Qoom Community");
    
    try {
        updateProgressBar(progressModal, 10, "Preparing project...");

        let coverImageData = null;
        if (coverImage) {
            updateProgressBar(progressModal, 25, "Processing cover image...");
            const resolvedMedia = await resolveCoverMedia(coverImage);
            if (resolvedMedia) {
                coverImageData = resolvedMedia;
            }
        }

        updateProgressBar(progressModal, 50, "Submitting to community...");

        const payload = {
            projectId: projectFolderPath,
            title: title,
            description: description,
            coverImage: coverImageData
        };

        const response = await fetch("/edit/publisher/_api/community/submit", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            updateProgressBar(progressModal, 100, "Failed!");
            removeProgressModal(progressModal);
            const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
            throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        updateProgressBar(progressModal, 90, "Finalizing...");
        const data = await response.json();
        if (data.success) {
            updateProgressBar(progressModal, 100, "Published!");
            setTimeout(() => removeProgressModal(progressModal), 500);
            showMessage("Project successfully published to Qoom Community!", "success");
        } else {
            updateProgressBar(progressModal, 100, "Failed!");
            removeProgressModal(progressModal);
            throw new Error(data.error || data.message || "Failed to publish to Qoom Community");
        }
    } catch (error) {
        removeProgressModal(progressModal);
        showMessage(`Publish failed: ${error.message}`, "error");
    }
}

async function resolveCoverMedia(coverImage) {
    if (coverImage.type === 'file') {
        return readFileAsMedia(coverImage.file);
    }
    if (coverImage.type === 'base64') {
        return {
            path: 'cover.png',
            filename: 'cover.png',
            content: coverImage.base64,
            encoding: 'base64',
            contentType: coverImage.contentType || 'image/png'
        };
    }
    if (coverImage.type === 'dataUrl') {
        const base64 = coverImage.dataUrl.split(',')[1];
        const contentTypeMatch = coverImage.dataUrl.match(/data:(.*);base64/);
        return {
            path: 'cover.png',
            filename: 'cover.png',
            content: base64,
            encoding: 'base64',
            contentType: contentTypeMatch ? contentTypeMatch[1] : 'image/png'
        };
    }
    if (coverImage.type === 'url') {
        const response = await fetch(coverImage.url);
        if (!response.ok) {
            throw new Error('Failed to fetch cover image');
        }
        const blob = await response.blob();
        const file = new File([blob], 'cover.png', { type: blob.type || 'image/png' });
        return readFileAsMedia(file);
    }
    return null;
}

function readFileAsMedia(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve({
                path: file.name,
                filename: file.name,
                content: base64,
                encoding: 'base64',
                contentType: file.type || 'image/png',
                size: file.size
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function injectCSS() {
    if (document.querySelector('link[href*="publisher.css"]')) {
        return;
    }

    await new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = "/view/applets/publisher/frontend/publisher.css";

        link.onload = resolve;
        link.onerror = reject;

        document.head.appendChild(link);
    });
}

async function initialize(_state) {
    state = _state;
    await injectCSS();
    qoomEvent.on("publisher:open", (event) => {
        const { path, isDirectory } = event.detail || {};
        if (path) {
            showPublishStartModal(path, isDirectory);
        }
    });
}

export {
    initialize
};
