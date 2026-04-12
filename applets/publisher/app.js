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

// [체크] 이 경로에 파일이 실제로 있는지 확인해주세요.
import { isValidFilePath, sanitizeFilePath, logActivity } from '../editer/utils/common.js';
import { saveGitHubConfigRecord, getGitHubTokenRecord } from './db/github-config.repository.js';
import {
  submitCommunityPost,
  listCommunityPosts,
  updateCommunityPostStatus
} from './db/community.repository.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE_PATH = path.join(__dirname, '../data/github-config.json');
const COMMUNITY_DB_PATH = path.join(__dirname, '../data/community_posts.json');
const DEFAULT_REQUEST_TIMEOUT_MS = Number(process.env.PUBLISHER_REQUEST_TIMEOUT_MS || 15000);

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
    const timeoutMs = Number(options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);

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
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });

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
    const timeoutMs = Number(options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);

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
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });
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
 * Get repository default branch
 */
async function getGitHubRepoDefaultBranch(owner, repo, token) {
  const response = await makeHttpsRequest(`https://api.github.com/repos/${owner}/${repo}`, {
    method: 'GET',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Qoom-Publisher'
    }
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
    throw new Error(error.message || `Failed to fetch repo info: ${response.statusCode}`);
  }
  return response.data?.default_branch || 'main';
}

/**
 * Create a GitHub blob (base64)
 */
async function createGitHubBlob(owner, repo, token, content) {
  const base64 = Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(content).toString('base64');
  const response = await makeHttpsRequest(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Qoom-Publisher'
    },
    body: JSON.stringify({
      content: base64,
      encoding: 'base64'
    })
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = typeof response.data === 'object' ? response.data : { message: 'Unknown error' };
    throw new Error(error.message || `Failed to create blob: ${response.statusCode}`);
  }
  return response.data?.sha;
}

/**
 * Publish all files as a single commit.
 * overwrite=true will replace the repo tree entirely with the provided files.
 */
async function publishFilesSingleCommit(owner, repo, files, token, message = 'Updated via Qoom', overwrite = true) {
  const branch = await getGitHubRepoDefaultBranch(owner, repo, token);

  const refResponse = await makeHttpsRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Qoom-Publisher'
      }
    }
  );

  if (refResponse.statusCode < 200 || refResponse.statusCode >= 300) {
    const error = typeof refResponse.data === 'object' ? refResponse.data : { message: 'Unknown error' };
    throw new Error(error.message || `Failed to get ref: ${refResponse.statusCode}`);
  }

  const headSha = refResponse.data?.object?.sha;
  if (!headSha) throw new Error('Failed to resolve branch HEAD');

  const commitResponse = await makeHttpsRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/commits/${headSha}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Qoom-Publisher'
      }
    }
  );

  if (commitResponse.statusCode < 200 || commitResponse.statusCode >= 300) {
    const error = typeof commitResponse.data === 'object' ? commitResponse.data : { message: 'Unknown error' };
    throw new Error(error.message || `Failed to get commit: ${commitResponse.statusCode}`);
  }

  const baseTreeSha = commitResponse.data?.tree?.sha;

  const treeEntries = [];
  for (const file of files) {
    const blobSha = await createGitHubBlob(owner, repo, token, file.content);
    treeEntries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobSha
    });
  }

  const treeResponse = await makeHttpsRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/trees`,
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Qoom-Publisher'
      },
      body: JSON.stringify({
        base_tree: overwrite ? undefined : baseTreeSha,
        tree: treeEntries
      })
    }
  );

  if (treeResponse.statusCode < 200 || treeResponse.statusCode >= 300) {
    const error = typeof treeResponse.data === 'object' ? treeResponse.data : { message: 'Unknown error' };
    throw new Error(error.message || `Failed to create tree: ${treeResponse.statusCode}`);
  }

  const newTreeSha = treeResponse.data?.sha;
  if (!newTreeSha) throw new Error('Failed to create tree');

  const newCommitResponse = await makeHttpsRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/commits`,
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Qoom-Publisher'
      },
      body: JSON.stringify({
        message: message,
        tree: newTreeSha,
        parents: [headSha]
      })
    }
  );

  if (newCommitResponse.statusCode < 200 || newCommitResponse.statusCode >= 300) {
    const error = typeof newCommitResponse.data === 'object' ? newCommitResponse.data : { message: 'Unknown error' };
    throw new Error(error.message || `Failed to create commit: ${newCommitResponse.statusCode}`);
  }

  const newCommitSha = newCommitResponse.data?.sha;
  if (!newCommitSha) throw new Error('Failed to create commit');

  const updateRefResponse = await makeHttpsRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Qoom-Publisher'
      },
      body: JSON.stringify({ sha: newCommitSha })
    }
  );

  if (updateRefResponse.statusCode < 200 || updateRefResponse.statusCode >= 300) {
    const error = typeof updateRefResponse.data === 'object' ? updateRefResponse.data : { message: 'Unknown error' };
    throw new Error(error.message || `Failed to update ref: ${updateRefResponse.statusCode}`);
  }

  return { branch, commitSha: newCommitSha };
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
  return submitCommunityPost(COMMUNITY_DB_PATH, postData);
}

async function saveCommunityDraft(postData) {
  return submitCommunityPost(COMMUNITY_DB_PATH, postData, 'DRAFT');
}

async function submitCommunityDraft(postData) {
  return submitCommunityPost(COMMUNITY_DB_PATH, postData, 'SUBMITTED');
}

/**
 * 커뮤니티 프로젝트 목록 조회 (필터링 지원)
 * @param {string} statusFilter - 'APPROVED', 'SUBMITTED' 등 (없으면 전체)
 */
async function getCommunityProjects(statusFilter = null) {
  return listCommunityPosts(COMMUNITY_DB_PATH, statusFilter);
}

async function getCommunityPublicProjects() {
  return getCommunityProjects('APPROVED');
}

/**
 * 관리자 승인/거절 처리
 */
async function updateCommunityStatus(id, status, adminComment = null, adminInfo = null) {
  return updateCommunityPostStatus(COMMUNITY_DB_PATH, id, status, adminComment, adminInfo);
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
  return saveGitHubConfigRecord(CONFIG_FILE_PATH, token, username);
}

/**
 * Load GitHub configuration from local file
 */
async function getGitHubToken() {
  return getGitHubTokenRecord(CONFIG_FILE_PATH);
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
  publishFilesSingleCommit,
  callPublisherApi,
  getGitHubUser,
  getGitHubRepoList,
  createGitHubRepository,
  saveGitHubConfig,
  getGitHubToken,
  withRetry,
  saveCommunityDraft,
  submitCommunityDraft,
  submitToCommunity,
  getCommunityProjects,
  getCommunityPublicProjects,
  updateCommunityStatus
};
