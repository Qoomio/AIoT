/**
 * Publisher Sub-Applet API
 * Fixed Version: Robust Body Parsing & Device Flow Auth
 */

import https from 'https';

import {
  publishToGitHub,
  publishToQoom,
  getQoomProjectDetails,
  getQoomProjects,
  updateQoomProject,
  deleteQoomProject,
  takeProjectScreenshot,
  getQoomMediaFile,
  callPublisherApi,
  getGitHubRepoList,
  createGitHubRepository,
  saveGitHubConfig,
  getGitHubToken,
  getGitHubUser,
  getAllFiles,
  uploadFileToGitHub,
  publishFilesSingleCommit,
  withRetry,
  saveCommunityDraft,
  submitCommunityDraft,
  getCommunityProjects,  // [추가]
  getCommunityPublicProjects,
  updateCommunityStatus  // [추가]
} from './app.js';
import { logActivity, sendApiResponse } from '../editer/utils/common.js';

// GitHub OAuth App Client ID
const GITHUB_CLIENT_ID = 'Ov23liyDtn21SHf3KiFR';
const activePublishLocks = new Set();

// [헬퍼 함수] GitHub API 요청 (HTTPS 모듈 사용)
function makeGitHubRequest(path, method, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'github.com',
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Qoom-Publisher'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          // JSON 파싱 시도
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          // JSON이 아니면 원본 텍스트 반환 (혹은 에러 처리)
          resolve(body);
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// [핵심 해결책] 요청 본문을 안전하게 읽어오는 도우미 함수
async function parseReqBody(req) {
  // 1. 이미 서버(Express 등)가 body를 파싱해 둔 경우 (req.body 사용)
  if (req.body && Object.keys(req.body).length > 0) {
    return req.body;
  }
  
  // 2. 파싱되지 않은 경우 직접 스트림 읽기 (Raw Node 방식)
  try {
    let body = '';
    for await (const chunk of req) body += chunk.toString();
    return JSON.parse(body || '{}');
  } catch (e) {
    return {};
  }
}

function getPublishLockKey(owner, repoName, folder) {
  return [owner, repoName, folder].map((v) => String(v || '').trim().toLowerCase()).join('::');
}

function getAdminInfo(req, payload = {}) {
  const admin = payload.admin || {};
  return {
    id: String(admin.id || req.headers['x-admin-id'] || '').trim(),
    name: String(admin.name || req.headers['x-admin-name'] || '').trim(),
    email: String(admin.email || req.headers['x-admin-email'] || '').trim().toLowerCase()
  };
}

/**
 * Standard API Module Export Format
 */
const api = {
  meta: {
    name: 'Project Publisher',
    description: 'Publish projects to GitHub',
    version: '1.0.2',
    author: 'System'
  },

  prefix: '/edit/publisher',

  routes: [
    {
      // [New] 로그아웃: GitHub 설정(토큰) 삭제
      path: '/_api/github/config',
      method: 'DELETE',
      handler: async (req, res) => {
        try {
          // 토큰과 유저네임을 null이나 빈 값으로 덮어씌워서 삭제 효과를 냅니다.
          await saveGitHubConfig(null, null);
          
          logActivity('publisher', 'github_logout');
          sendApiResponse(res, 200, true, { message: 'Logged out successfully.' });
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    
    {
      // [New] 0. GitHub 설정(토큰) 저장 API
      path: '/_api/github/config',
      method: 'POST',
      handler: async (req, res) => {
        try {
          // [수정됨] 안전한 파싱 함수 사용
          const { token, username } = await parseReqBody(req);

          if (!token) {
            // 디버깅을 위해 로그에 남김
            console.log('[Debug] Token missing. Received:', await parseReqBody(req));
            return sendApiResponse(res, 400, false, null, 'Token is required');
          }

          logActivity('publisher', 'github_save_config', { username });
          await saveGitHubConfig(token, username);
          sendApiResponse(res, 200, true, { message: 'GitHub token saved safely.' });

        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },

    // 1️⃣ [Start] 인증 시작: 사용자 코드(User Code) 요청
    {
      path: '/_api/auth/github/device/code',
      method: 'POST',
      handler: async (req, res) => {
        try {
          // GitHub에 Device Code 요청
          const result = await makeGitHubRequest('/login/device/code', 'POST', {
            client_id: GITHUB_CLIENT_ID,
            scope: 'repo' // 레포지토리 제어 권한
          });
          
          logActivity('publisher', 'github_device_code_request');
          sendApiResponse(res, 200, true, result);
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },

    // 2️⃣ [Poll] 인증 확인: 사용자가 코드를 입력했는지 주기적으로 확인
    {
      path: '/_api/auth/github/device/poll',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const body = await parseReqBody(req);
          const { device_code } = body;

          if (!device_code) {
             return sendApiResponse(res, 400, false, null, 'Device code is required');
          }

          // GitHub에 토큰 교환 요청
          const result = await makeGitHubRequest('/login/oauth/access_token', 'POST', {
            client_id: GITHUB_CLIENT_ID,
            device_code: device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
          });

          if (result.access_token) {
            // 🎉 인증 성공!
            // 기존 app.js에 있는 saveGitHubConfig 함수 활용 (username은 API 호출로 가져오거나 생략 가능)
            // 여기서는 일단 username을 'GitHub User'로 임시 저장하고, 나중에 API로 갱신하는 게 안전함
            await saveGitHubConfig(result.access_token, 'GitHub User');
            
            logActivity('publisher', 'github_auth_success');
            sendApiResponse(res, 200, true, { status: 'complete', token: 'saved' });

          } else if (result.error === 'authorization_pending') {
            // ⏳ 아직 입력 안 함 (대기 중)
            sendApiResponse(res, 200, true, { status: 'pending' });

          } else if (result.error === 'slow_down') {
            // 🐢 너무 자주 요청함
            sendApiResponse(res, 200, true, { status: 'slow_down', interval: result.interval });

          } else {
            // ❌ 에러 (만료됨, 거절됨 등)
            sendApiResponse(res, 400, false, { error: result.error }, result.error_description);
          }
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },

    // -----------------------------------------------------------

    {
      // [Updated] 1. GitHub Repository List 조회
      path: '/_api/github/repos',
      method: 'GET',
      handler: async (req, res) => {
        try {
          const token = await getGitHubToken();
          if (!token) return sendApiResponse(res, 401, false, null, 'GitHub 연동이 필요합니다. (토큰 없음)');

          logActivity('publisher', 'github_list_repos_request');
          const result = await getGitHubRepoList(token);
          sendApiResponse(res, 200, true, result);

        } catch (error) {
          if (error.message.includes('401') || error.message.includes('Bad credentials')) {
             return sendApiResponse(res, 401, false, null, 'GitHub 토큰이 만료되었습니다.');
          }
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },

    {
      // [Updated] 2. GitHub Repository 생성
      path: '/_api/github/repos',
      method: 'POST',
      handler: async (req, res) => {
        try {
          // [수정됨] 안전한 파싱 함수 사용
          const parsedBody = await parseReqBody(req);
          const { repoName, isPrivate = false, description } = parsedBody; //Also add

          if (!repoName) return sendApiResponse(res, 400, false, null, 'Repository name is required');

          const token = await getGitHubToken();
          if (!token) return sendApiResponse(res, 401, false, null, 'GitHub 연동이 필요합니다.');

          const cleanRepoName = repoName.trim();
          logActivity('publisher', 'github_create_repo_request', { repoName: cleanRepoName, isPrivate, description }); //Add log description

          try {
            const result = await createGitHubRepository(token, cleanRepoName, !!isPrivate, description); //Add description
            const newRepo = result.newRepo || result; 

            return sendApiResponse(res, 201, true, {
              name: newRepo.name,
              full_name: newRepo.full_name,
              html_url: newRepo.html_url,
              default_branch: newRepo.default_branch || 'main'
            });

          } catch (apiError) {
             let errorCode = 'GITHUB_API_ERROR';
             const errorString = apiError.message || '';
             if (errorString.includes('name already exists')) errorCode = 'REPO_EXISTS';
             return sendApiResponse(res, 400, false, { code: errorCode, originalError: errorString }, apiError.message);
          }
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },

    {
      // Publish to GitHub
      path: '/_api/publish/github',
      method: 'POST',
      handler: async (req, res) => {
        let lockKey = '';
        try {
          // [수정됨] 안전한 파싱 함수 사용
          const parsedBody = await parseReqBody(req);
          const { folder, repoName, commitMessage, overwrite = true } = parsedBody;

          if (!folder || !repoName) return sendApiResponse(res, 400, false, null, 'Project folder and repo name required.');

          const token = await getGitHubToken();
          if (!token) return sendApiResponse(res, 401, false, null, 'GitHub 연동이 필요합니다.');

          const userInfo = await getGitHubUser(token);
          const owner = userInfo.login;
          lockKey = getPublishLockKey(owner, repoName, folder);
          if (activePublishLocks.has(lockKey)) {
            return sendApiResponse(
              res,
              409,
              false,
              null,
              'A publish is already in progress for this project/repository.'
            );
          }
          activePublishLocks.add(lockKey);

          logActivity('publisher', 'github_publish_start', { repo: repoName, folder });

          const projectFiles = await getAllFiles(folder);
          if (!projectFiles || projectFiles.length === 0) return sendApiResponse(res, 400, false, null, 'No files to upload.');

          const result = await publishFilesSingleCommit(
            owner,
            repoName,
            projectFiles,
            token,
            commitMessage || 'Updated via Qoom',
            overwrite !== false
          );

          const resultMessage = `Published ${projectFiles.length} files in a single commit.`;
          const repoUrl = `https://github.com/${owner}/${repoName}`;

          return sendApiResponse(res, 200, true, {
            message: resultMessage,
            repoUrl: repoUrl,
            pushedFiles: projectFiles.length,
            commitSha: result.commitSha,
            branch: result.branch,
            overwrite: overwrite !== false
          });

        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        } finally {
          if (lockKey) activePublishLocks.delete(lockKey);
        }
      }
    },
    
    // Qoom 기존 라우트들도 같은 방식으로 수정
    {
      path: '/_api/publish/qoom',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const parsedBody = await parseReqBody(req);
          const { folder, projectData, mediaFiles = [] } = parsedBody;
          if (!folder) return sendApiResponse(res, 400, false, null, 'Project folder is required');
          const result = await publishToQoom(folder, projectData, mediaFiles);
          sendApiResponse(res, 200, true, result);
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    {
      path: '/_api/qoom/project/details',
      method: 'GET',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const folder = url.searchParams.get('folder');
          if (!folder) return sendApiResponse(res, 400, false, null, 'Project folder is required');
          const result = await getQoomProjectDetails(folder);
          sendApiResponse(res, 200, true, result);
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    {
      path: '/_api/qoom/projects',
      method: 'GET',
      handler: async (req, res) => {
        try {
          const result = await getQoomProjects();
          sendApiResponse(res, 200, true, result);
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    {
      path: '/_api/qoom/project/:id',
      method: 'PATCH',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const id = url.pathname.split('/').pop();
          const parsedBody = await parseReqBody(req);
          const { projectData, mediaFiles = [] } = parsedBody;
          if (!id) return sendApiResponse(res, 400, false, null, 'Project ID is required');
          const result = await updateQoomProject(id, projectData, mediaFiles);
          sendApiResponse(res, 200, true, result);
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    {
      path: '/_api/qoom/project/:id',
      method: 'DELETE',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const id = url.pathname.split('/').pop();
          if (!id) return sendApiResponse(res, 400, false, null, 'Project ID is required');
          const result = await deleteQoomProject(id);
          sendApiResponse(res, 200, true, result);
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    {
      path: '/_api/qoom/screenshot',
      method: 'GET',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const projectPath = url.searchParams.get('projectpath');
          const isMobile = url.searchParams.get('isMobile') === 'true';
          if (!projectPath) return sendApiResponse(res, 400, false, null, 'Project path is required');
          const result = await takeProjectScreenshot(projectPath, isMobile);
          sendApiResponse(res, 200, true, result);
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    {
      path: '/_api/qoom/media/:id',
      method: 'GET',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const id = url.pathname.split('/').pop();
          if (!id) return sendApiResponse(res, 400, false, null, 'Media ID is required');
          const mediaUrl = await getQoomMediaFile(id);
          sendApiResponse(res, 200, true, { mediaUrl });
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },

    // ==========================================
    // [Phase 2] Community API Routes (New)
    // ==========================================
    
    {
      // 0. 커뮤니티 draft 저장
      path: '/_api/community/draft',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const parsedBody = await parseReqBody(req);
          if (!parsedBody || Object.keys(parsedBody).length === 0) {
            return sendApiResponse(res, 400, false, null, 'No data provided');
          }

          const result = await saveCommunityDraft(parsedBody);
          sendApiResponse(res, 200, true, {
            message: 'Draft saved',
            data: result
          });
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },

    {
      // 1. 커뮤니티 배포 신청 (사용자 -> 로컬 DB)
      path: '/_api/community/submit',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const parsedBody = await parseReqBody(req); // 안전한 파싱
          
          if (!parsedBody || Object.keys(parsedBody).length === 0) {
            return sendApiResponse(res, 400, false, null, 'No data provided');
          }

          // draft -> submitted 상태 전환
          const result = await submitCommunityDraft(parsedBody);
          
          sendApiResponse(res, 200, true, {
            message: 'Submitted successfully to Community',
            data: result
          });
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },

    {
      // 2. 커뮤니티 프로젝트 목록 조회 (뷰어/관리자용)
      path: '/_api/community/projects',
      method: 'GET',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const statusFilter = url.searchParams.get('status'); // ?status=APPROVED
          
          const projects = await getCommunityProjects(statusFilter);
          
          sendApiResponse(res, 200, true, projects);
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },
    {
      // 2-1. 공개 커뮤니티 목록 조회 (APPROVED only)
      path: '/_api/community/public/projects',
      method: 'GET',
      handler: async (req, res) => {
        try {
          const projects = await getCommunityPublicProjects();
          sendApiResponse(res, 200, true, projects);
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    },

    {
      // 3. 관리자 승인/거절 처리 (관리자용)
      path: '/_api/community/status',
      method: 'POST',
      handler: async (req, res) => {
        try {
          const parsedBody = await parseReqBody(req);
          const { id, status, comment } = parsedBody;

          if (!id || !status) {
            return sendApiResponse(res, 400, false, null, 'ID and Status are required');
          }
          const normalizedStatus = String(status).trim().toUpperCase();
          if (!['APPROVED', 'REJECTED'].includes(normalizedStatus)) {
            return sendApiResponse(res, 400, false, null, 'Status must be APPROVED or REJECTED');
          }
          if (normalizedStatus === 'REJECTED' && !String(comment || '').trim()) {
            return sendApiResponse(res, 400, false, null, 'Rejection reason(comment) is required');
          }

          const adminInfo = getAdminInfo(req, parsedBody);
          const result = await updateCommunityStatus(id, normalizedStatus, comment, adminInfo);

          sendApiResponse(res, 200, true, {
            message: `Project status updated to ${normalizedStatus}`,
            data: result
          });
        } catch (error) {
          sendApiResponse(res, 500, false, null, error.message);
        }
      }
    }
  ]
};

export default api;
