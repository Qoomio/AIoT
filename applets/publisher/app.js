/**
 * Publisher Sub-Applet Helper Functions
 *
 * This module provides helper functions for publishing projects to GitHub.
 * Fixed Version: Device Flow Compatible & Binary File Support
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// [체크] 이 경로에 파일이 실제로 있는지 확인해주세요.
import { isValidFilePath, sanitizeFilePath, logActivity } from '../editer/utils/common.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB configuration (Publisher)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/qoom2';

let mongoConnectPromise = null;

async function connectPublisherDb() {
  if (mongoose.connection.readyState === 1) return;
  if (mongoConnectPromise) return mongoConnectPromise;
  mongoConnectPromise = mongoose.connect(MONGODB_URI);
  try {
    return await mongoConnectPromise;
  } catch (error) {
    mongoConnectPromise = null;
    throw error;
  }
}

const gitHubConfigSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'default' },
    token: { type: String, default: null },
    username: { type: String, default: '' }
  },
  { timestamps: true, collection: 'publisher_github_configs' }
);

const communityPostSchema = new mongoose.Schema(
  {
    id: { type: String, index: true },
    projectId: { type: String, index: true },
    repoName: { type: String, index: true },
    status: { type: String, default: 'SUBMITTED', index: true },
    adminComments: [
      {
        action: String,
        comment: String,
        date: Date
      }
    ]
  },
  { timestamps: true, strict: false, collection: 'publisher_community_posts' }
);

const GitHubConfig =
  mongoose.models.GitHubConfig || mongoose.model('GitHubConfig', gitHubConfigSchema);
const CommunityPost =
  mongoose.models.CommunityPost || mongoose.model('CommunityPost', communityPostSchema);

// --------------------------------------------------------------------------
// [Phase 2] Stabilization Utilities (Retry Logic)
// --------------------------------------------------------------------------

/**
 * 비동기 작업을 재시도하는 래퍼 함수 (Exponential Backoff 적용)
 * @param {Function} fn - 실행할 비동기 함수
 * @param {number} retries - 최대 재시도 횟수 (기본 3)
 * @param {number} delay - 대기 시간 (ms)
 */
async function withRetry(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;
    console.warn(`[Stabilization] Action failed. Retrying in ${delay}ms... (${retries} left). Error: ${err.message}`);
    
    // 지수 백오프 (1초 -> 2초 -> 4초 대기)
    await new Promise(res => setTimeout(res, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

/**
 * Get all files in a directory recursively
 * [수정됨] 이미지가 깨지지 않도록 'utf8' 강제 변환을 제거하고 Buffer로 읽습니다.
 * Used by: /_api/publish/github (api.js)
 */
async function getAllFiles(dirPath, basePath = '') {
  const files = [];
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(fullPath, relativePath);
        files.push(...subFiles);
      } else {
        try {
          // ⚠️ 중요: utf8 옵션을 빼서 바이너리(이미지 등)도 안전하게 읽도록 수정
          const content = await fs.promises.readFile(fullPath);
          files.push({
            path: relativePath,
            content: content // Buffer 상태로 전달
          });
        } catch (error) {
          console.error(`Error reading file ${fullPath}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error(`Directory reading failed: ${dirPath}`, error.message);
    return [];
  }
  return files;
}

/**
 * Make HTTP/HTTPS request
 */
function makeHttpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = httpModule.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsedData = res.headers['content-type']?.includes('application/json')
            ? JSON.parse(data)
            : data;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Make HTTP/HTTPS request with form-data
 */
function makeFormDataRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const formData = options.formData;
    if (!formData) {
      return reject(new Error('formData is required'));
    }

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'POST',
      headers: formData.getHeaders()
    };

    const req = httpModule.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsedData = res.headers['content-type']?.includes('application/json')
            ? JSON.parse(data)
            : data;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    formData.pipe(req);
  });
}

/**
 * Upload file to GitHub repository (with Retry Logic)
 * Used by: /_api/publish/github (api.js)
 */
async function uploadFileToGitHub(owner, repo, filePath, content, token, message = 'Add file') {
  // 전체 로직을 withRetry로 감싸서, 실패 시 자동으로 3번 재시도합니다.
  return withRetry(async () => {
    
    // --- [기존 로직 시작] ---
    // content가 Buffer여도, String이어도 안전하게 base64로 변환
    const encodedContent = Buffer.from(content).toString('base64');
    const encodedFilePath = filePath.split('/').map(encodeURIComponent).join('/');

    // 기존 파일 확인하여 SHA 가져오기
    let existingSha = null;
    try {
      const getResponse = await makeHttpsRequest(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedFilePath}`, {
        method: 'GET',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Qoom-Publisher'
        }
      });
      
      if (getResponse.statusCode === 200 && getResponse.data?.sha) {
        existingSha = getResponse.data.sha;
        console.log(`[Publisher] File exists, using SHA for update: ${filePath}`);
      }
    } catch (err) {
      // 파일이 없으면 404, 새 파일로 처리 (에러 아님)
      console.log(`[Publisher] New file, no SHA needed: ${filePath}`);
    }

    const payload = {
      message: message,
      content: encodedContent
    };
    
    if (existingSha) {
      payload.sha = existingSha;
    }

    const response = await makeHttpsRequest(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedFilePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Qoom-Publisher'
      },
      body: JSON.stringify(payload)
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
      // 여기서 에러를 던지면 -> withRetry가 잡아서 다시 시도합니다.
      throw new Error(error.message || `Failed to upload file ${filePath}: ${response.statusCode}`);
    }

    return response.data;
    // --- [기존 로직 끝] ---

  }, 3, 1000); // 3회 재시도, 초기 대기시간 1초
}

/**
 * Publish project to GitHub (Legacy wrapper)
 */
async function publishToGitHub(projectPath, token, isPrivate = false) {
  try {
    logActivity('publisher', 'github_publish_start', { projectPath, isPrivate });

    const response = await callPublisherApi('github', {
      method: 'POST',
      body: {
        folder: projectPath,
        isPrivate: isPrivate
      }
    });

    logActivity('publisher', 'github_publish_success', { projectPath, repoUrl: response.repoUrl });

    return {
      success: true,
      repoUrl: response.repoUrl,
      repoName: response.repoName,
      uploadedFiles: response.uploadedFiles || 0
    };

  } catch (error) {
    logActivity('publisher', 'github_publish_error', { projectPath, error: error.message });
    throw error;
  }
}

/**
 * Call server-side publisher API
 */
async function callPublisherApi(endpoint, options = {}) {
  const url = endpoint.startsWith('/') ? endpoint : `/publishh/${endpoint}`;
  const fullUrl = url.startsWith('http') ? url : `http://localhost${url}`;

  const requestOptions = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  if (options.body) {
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await makeHttpsRequest(fullUrl, requestOptions);

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
    throw new Error(error.error || error.message || `API request failed: ${response.statusCode}`);
  }

  if (response.data && typeof response.data === 'object') {
    if ('success' in response.data) return response.data;
    return { success: true, ...response.data };
  }
  return response.data;
}

/**
 * Publish project to Qoom platform (유지)
 */

// --------------------------------------------------------------------------
// [Phase 2] Community Logic (MongoDB via Mongoose)
// --------------------------------------------------------------------------
/**
 * 커뮤니티에 프로젝트 제출 (Create or Update)
 */
async function submitToCommunity(postData) {
  await connectPublisherDb();

  const conditions = [];
  if (postData?.projectId) conditions.push({ projectId: postData.projectId });
  if (postData?.repoName) conditions.push({ repoName: postData.repoName });
  if (postData?.id) conditions.push({ id: postData.id });

  const query = conditions.length ? { $or: conditions } : null;
  const existing = query ? await CommunityPost.findOne(query) : null;

  if (existing) {
    const updated = {
      ...existing.toObject(),
      ...postData,
      status: 'SUBMITTED',
      adminComments: existing.adminComments || []
    };
    const saved = await CommunityPost.findByIdAndUpdate(existing._id, updated, {
      new: true
    });
    return saved?.toObject() || updated;
  }

  const newEntry = new CommunityPost({
    ...postData,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    status: 'SUBMITTED',
    adminComments: []
  });
  const saved = await newEntry.save();
  return saved.toObject();
}

/**
 * 커뮤니티 프로젝트 목록 조회 (필터링 지원)
 * @param {string} statusFilter - 'APPROVED', 'SUBMITTED' 등 (없으면 전체)
 */
async function getCommunityProjects(statusFilter = null) {
  await connectPublisherDb();
  const filter = statusFilter ? { status: statusFilter } : {};
  return CommunityPost.find(filter).sort({ createdAt: -1 }).lean();
}

/**
 * 관리자 승인/거절 처리
 */
async function updateCommunityStatus(id, status, adminComment = null) {
  await connectPublisherDb();

  const query = { $or: [{ id }, { projectId: id }] };
  const update = { status };
  const updateOps = { $set: update };

  if (adminComment) {
    updateOps.$push = {
      adminComments: {
        action: status,
        comment: adminComment,
        date: new Date()
      }
    };
  }

  const updated = await CommunityPost.findOneAndUpdate(query, updateOps, {
    new: true
  });

  if (!updated) throw new Error('Project not found');
  return updated.toObject();
}

async function publishToQoom(folder, projectData, mediaFiles = []) {
  try {
    const { name, description, link, giturl, displayType, imgLink, submittoqoom = false, tags = [] } = projectData;

    if (!name || !link) {
      throw new Error('Project name and link are required');
    }

    logActivity('publisher', 'qoom_publish_start', { folder, name });

    let FormData;
    try { FormData = (await import('form-data')).default; } catch (e) { FormData = null; }

    // (기존 코드 유지)
    if (FormData) {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description || '');
      formData.append('link', link);
      formData.append('displayType', displayType || 'card');
      formData.append('imgLink', imgLink || '');
      formData.append('submittoqoom', submittoqoom ? 'true' : 'false');
      if (giturl) formData.append('giturl', giturl);
      if (tags && tags.length) {
        const tagsValue = Array.isArray(tags) ? JSON.stringify(tags) : tags;
        formData.append('tags', tagsValue);
      }

      for (const mediaFile of mediaFiles) {
        if (mediaFile.path && mediaFile.content) {
          const buffer = Buffer.from(mediaFile.content, mediaFile.encoding || 'base64');
          formData.append('media', buffer, {
            filename: mediaFile.filename || path.basename(mediaFile.path),
            contentType: mediaFile.contentType || 'image/png'
          });
        } else if (mediaFile.path && fs.existsSync(mediaFile.path)) {
          formData.append('media', fs.createReadStream(mediaFile.path), {
            filename: path.basename(mediaFile.path)
          });
        } else if (mediaFile.buffer) {
          formData.append('media', mediaFile.buffer, {
            filename: mediaFile.filename || 'image.png',
            contentType: mediaFile.contentType || 'image/png'
          });
        }
      }

      const response = await makeFormDataRequest(`http://localhost/publishh/projectt?folder=${encodeURIComponent(folder)}`, {
        method: 'POST',
        formData: formData
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
        throw new Error(error.error || error.message || `Failed to publish project: ${response.statusCode}`);
      }
      logActivity('publisher', 'qoom_publish_success', { folder, name, result: response.data });
      return response.data;

    } else {
      // Fallback
      const response = await makeHttpsRequest(`http://localhost/publishh/projectt?folder=${encodeURIComponent(folder)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description: description || '', link, displayType: displayType || 'card',
          imgLink: imgLink || '', submittoqoom, giturl: giturl || '',
          tags: tags && Array.isArray(tags) ? tags : (tags ? JSON.parse(tags) : []),
          mediaFiles: mediaFiles.map(m => ({
            path: m.path, filename: m.filename || path.basename(m.path),
            content: m.content, encoding: m.encoding || 'base64', contentType: m.contentType || 'image/png'
          }))
        })
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
        throw new Error(error.error || error.message || `Failed to publish project: ${response.statusCode}`);
      }
      logActivity('publisher', 'qoom_publish_success', { folder, name, result: response.data });
      return response.data;
    }

  } catch (error) {
    logActivity('publisher', 'qoom_publish_error', { folder, error: error.message });
    throw error;
  }
}

async function getQoomProjectDetails(folder) {
  try {
    const response = await callPublisherApi(`detailss?folder=${encodeURIComponent(folder)}`);
    return response;
  } catch (error) {
    logActivity('publisher', 'qoom_get_details_error', { folder, error: error.message });
    throw error;
  }
}

async function getQoomProjects() {
  try {
    const response = await callPublisherApi('projects');
    return response || [];
  } catch (error) {
    logActivity('publisher', 'qoom_get_projects_error', { error: error.message });
    throw error;
  }
}

async function updateQoomProject(id, projectData, mediaFiles = []) {
  try {
    // (기존 코드 유지)
    const { name, description, link, giturl, displayType, imgLink, submittoqoom = false, tags = [] } = projectData;

    if (!name || !link) { throw new Error('Project name and link are required'); }
    logActivity('publisher', 'qoom_update_start', { id, name });

    let FormData;
    try { FormData = (await import('form-data')).default; } catch (e) { FormData = null; }

    if (FormData) {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description || '');
      formData.append('link', link);
      formData.append('displayType', displayType || 'card');
      formData.append('imgLink', imgLink || '');
      formData.append('submittoqoom', submittoqoom ? 'true' : 'false');
      if (giturl) formData.append('giturl', giturl);
      if (tags && tags.length) {
        const tagsValue = Array.isArray(tags) ? JSON.stringify(tags) : tags;
        formData.append('tags', tagsValue);
      }
      for (const mediaFile of mediaFiles) {
        if (mediaFile.path && mediaFile.content) {
          const buffer = Buffer.from(mediaFile.content, mediaFile.encoding || 'base64');
          formData.append('media', buffer, { filename: mediaFile.filename || path.basename(mediaFile.path), contentType: mediaFile.contentType || 'image/png' });
        } else if (mediaFile.path && fs.existsSync(mediaFile.path)) {
          formData.append('media', fs.createReadStream(mediaFile.path), { filename: path.basename(mediaFile.path) });
        } else if (mediaFile.buffer) {
          formData.append('media', mediaFile.buffer, { filename: mediaFile.filename || 'image.png', contentType: mediaFile.contentType || 'image/png' });
        }
      }
      const response = await makeFormDataRequest(`http://localhost/publishh/projectt/${id}`, { method: 'PATCH', formData: formData });
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
        throw new Error(error.error || error.message || `Failed to update project: ${response.statusCode}`);
      }
      logActivity('publisher', 'qoom_update_success', { id, name, result: response.data });
      return response.data;
    } else {
      const response = await makeHttpsRequest(`http://localhost/publishh/projectt/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description: description || '', link, displayType: displayType || 'card', imgLink: imgLink || '', submittoqoom, giturl: giturl || '',
          tags: tags && Array.isArray(tags) ? tags : (tags ? JSON.parse(tags) : []),
          mediaFiles: mediaFiles.map(m => ({ path: m.path, filename: m.filename || path.basename(m.path), content: m.content, encoding: m.encoding || 'base64', contentType: m.contentType || 'image/png' }))
        })
      });
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
        throw new Error(error.error || error.message || `Failed to update project: ${response.statusCode}`);
      }
      logActivity('publisher', 'qoom_update_success', { id, name, result: response.data });
      return response.data;
    }
  } catch (error) {
    logActivity('publisher', 'qoom_update_error', { id, error: error.message });
    throw error;
  }
}

async function deleteQoomProject(id) {
  try {
    logActivity('publisher', 'qoom_delete_start', { id });
    const response = await callPublisherApi(`projectt/${id}`, { method: 'DELETE' });
    logActivity('publisher', 'qoom_delete_success', { id });
    return response;
  } catch (error) {
    logActivity('publisher', 'qoom_delete_error', { id, error: error.message });
    throw error;
  }
}

async function takeProjectScreenshot(projectPath, isMobile = false) {
  try {
    logActivity('publisher', 'screenshot_start', { projectPath, isMobile });
    const response = await callPublisherApi(`screenshot?projectpath=${encodeURIComponent(projectPath)}&isMobile=${isMobile}`);
    logActivity('publisher', 'screenshot_success', { projectPath, isMobile, result: response });
    return response;
  } catch (error) {
    logActivity('publisher', 'screenshot_error', { projectPath, isMobile, error: error.message });
    throw error;
  }
}

async function getQoomMediaFile(id) {
  try {
    const response = await makeHttpsRequest(`http://localhost/publishh/media/${id}`, { method: 'GET' });
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`Failed to get media file: ${response.statusCode}`);
    return response.data;
  } catch (error) {
    logActivity('publisher', 'qoom_get_media_error', { id, error: error.message });
    throw error;
  }
}

/**
 * Get GitHub user information
 * Used by: /_api/publish/github (api.js)
 */
async function getGitHubUser(token) {
  try {
    const response = await makeHttpsRequest('https://api.github.com/user', {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Qoom-Publisher'
      }
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
      throw new Error(error.message || `Failed to get GitHub user: ${response.statusCode}`);
    }
    return response.data;
  } catch (error) {
    logActivity('publisher', 'github_get_user_error', { error: error.message });
    throw error;
  }
}

/**
 * Get GitHub repository list
 */
async function getGitHubRepoList(token) {
  try {
    logActivity('publisher', 'github_get_repo_list_start', {});

    // First get user info to get repos_url
    const userInfo = await getGitHubUser(token);
    if (!userInfo || !userInfo.repos_url) throw new Error('Failed to get user repositories URL');

    const response = await makeHttpsRequest(userInfo.repos_url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Qoom-Publisher'
      }
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
      throw new Error(error.message || `Failed to get repository list: ${response.statusCode}`);
    }

    const repoList = Array.isArray(response.data) ? response.data.map(r => r.name) : [];
    logActivity('publisher', 'github_get_repo_list_success', { count: repoList.length });
    return { gitRepoList: repoList, gitUser: userInfo.login };

  } catch (error) {
    logActivity('publisher', 'github_get_repo_list_error', { error: error.message });
    throw error;
  }
}

/**
 * Create a new GitHub repository
 * Used by: /_api/github/repos (api.js)
 */
async function createGitHubRepository(token, repoName, isPrivate = false, description = '') {
  try {
    logActivity('publisher', 'github_create_repo_start', { repoName, isPrivate, description });

    const response = await makeHttpsRequest('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Qoom-Publisher'
      },
      body: JSON.stringify({
        name: repoName,
        auto_init: true,
        private: isPrivate,
        description: description || 'Created with Qoom',
        homepage: 'https://qoom.io',
        is_template: false
      })
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
      throw new Error(error.message || `Failed to create repository: ${response.statusCode}`);
    }

    logActivity('publisher', 'github_create_repo_success', { repoName, repoUrl: response.data.html_url });
    return { newRepo: response.data };

  } catch (error) {
    logActivity('publisher', 'github_create_repo_error', { repoName, error: error.message });
    throw error;
  }
}

/**
 * Save GitHub configuration (Token) to local file
 * [수정됨] 디렉토리 생성 및 에러 처리 보강
 */
async function saveGitHubConfig(token, username = '') {
  try {
    await connectPublisherDb();
    const saved = await GitHubConfig.findOneAndUpdate(
      { key: 'default' },
      { token, username },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return saved?.toObject() || { token, username };
  } catch (error) {
    console.error('[GitHub Config] Save Error:', error);
    throw error;
  }
}

/**
 * Load GitHub configuration from local file
 */
async function getGitHubToken() {
  try {
    await connectPublisherDb();
    const config = await GitHubConfig.findOne({ key: 'default' }).lean();
    return config?.token || null;
  } catch (error) {
    console.error('Failed to load GitHub config:', error);
    return null;
  }
}

// ==========================================
// Final Export
// ==========================================
export {
  publishToGitHub,
  publishToQoom,
  getQoomProjectDetails,
  getQoomProjects,
  updateQoomProject,
  deleteQoomProject,
  takeProjectScreenshot,
  getQoomMediaFile,
  getAllFiles,
  uploadFileToGitHub,
  callPublisherApi,
  getGitHubUser,
  getGitHubRepoList,
  createGitHubRepository,
  saveGitHubConfig,
  getGitHubToken,
  withRetry,
  submitToCommunity,
  getCommunityProjects,
  updateCommunityStatus
};
