import { connectPublisherDb } from './connection.js';
import { CommunityPost, COMMUNITY_STATUS } from './models.js';
import { loadJsonFile, saveJsonFile } from './json-store.js';

const COMMUNITY_STATUSES = new Set(Object.values(COMMUNITY_STATUS));
const SUBMITTABLE_STATUSES = new Set([COMMUNITY_STATUS.DRAFT, COMMUNITY_STATUS.SUBMITTED]);

function validateCommunityStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (!COMMUNITY_STATUSES.has(normalized)) {
    throw new Error(`Invalid status. Allowed: ${Array.from(COMMUNITY_STATUSES).join(', ')}`);
  }
  return normalized;
}

function normalizeSubmitter(postData = {}) {
  const submitter = postData.submitter || {};
  return {
    id: String(submitter.id || postData.submitterId || '').trim(),
    name: String(submitter.name || postData.author || '').trim(),
    email: String(submitter.email || postData.email || '').trim().toLowerCase()
  };
}

function normalizeMetadata(postData = {}) {
  const metadata = postData.metadata || {};
  const rawTags = metadata.tags || postData.tags || [];
  const tags = Array.isArray(rawTags)
    ? rawTags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : [];
  return {
    title: String(metadata.title || postData.title || postData.projectName || '').trim(),
    description: String(metadata.description || postData.description || '').trim(),
    tags,
    repoUrl: String(metadata.repoUrl || postData.repoUrl || postData.github || '').trim(),
    liveUrl: String(metadata.liveUrl || postData.liveUrl || '').trim(),
    thumbnailUrl: String(metadata.thumbnailUrl || postData.thumbnailUrl || postData.image || '').trim(),
    category: String(metadata.category || postData.category || '').trim()
  };
}

function buildNormalizedPostPayload(postData = {}, status) {
  return {
    ...postData,
    projectId: String(postData.projectId || '').trim(),
    repoName: String(postData.repoName || '').trim(),
    status,
    submitter: normalizeSubmitter(postData),
    metadata: normalizeMetadata(postData)
  };
}

async function submitCommunityPost(communityDbPath, postData, targetStatus = COMMUNITY_STATUS.SUBMITTED) {
  const normalizedStatus = validateCommunityStatus(targetStatus);
  if (!SUBMITTABLE_STATUSES.has(normalizedStatus)) {
    throw new Error('submitCommunityPost only supports DRAFT or SUBMITTED');
  }

  const normalizedPostData = buildNormalizedPostPayload(postData, normalizedStatus);

  try {
    await connectPublisherDb();

    const conditions = [];
    if (normalizedPostData?.projectId) conditions.push({ projectId: normalizedPostData.projectId });
    if (normalizedPostData?.repoName) conditions.push({ repoName: normalizedPostData.repoName });
    if (normalizedPostData?.id) conditions.push({ id: normalizedPostData.id });

    const query = conditions.length ? { $or: conditions } : null;
    const existing = query ? await CommunityPost.findOne(query) : null;

    if (existing) {
      const updated = {
        ...existing.toObject(),
        ...normalizedPostData,
        status: normalizedStatus,
        adminComments: existing.adminComments || [],
        moderationLogs: existing.moderationLogs || []
      };
      const saved = await CommunityPost.findByIdAndUpdate(existing._id, updated, {
        new: true
      });
      return saved?.toObject() || updated;
    }

    const newEntry = new CommunityPost({
      ...normalizedPostData,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      status: normalizedStatus,
      adminComments: [],
      moderationLogs: []
    });
    const saved = await newEntry.save();
    return saved.toObject();
  } catch (error) {
    const posts = loadJsonFile(communityDbPath, []);
    const existingIndex = posts.findIndex((p) =>
      (p.projectId && p.projectId === normalizedPostData.projectId) ||
      (p.repoName && p.repoName === normalizedPostData.repoName) ||
      (p.id && p.id === normalizedPostData.id)
    );
    const timestamp = new Date().toISOString();
    const next = {
      ...normalizedPostData,
      status: normalizedStatus,
      updatedAt: timestamp
    };
    if (existingIndex >= 0) {
      const existing = posts[existingIndex];
      posts[existingIndex] = {
        ...existing,
        ...next,
        createdAt: existing.createdAt || timestamp,
        adminComments: existing.adminComments || [],
        moderationLogs: existing.moderationLogs || []
      };
      saveJsonFile(communityDbPath, posts);
      return posts[existingIndex];
    }
    next.id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    next.createdAt = timestamp;
    next.adminComments = [];
    next.moderationLogs = [];
    posts.push(next);
    saveJsonFile(communityDbPath, posts);
    return next;
  }
}

async function listCommunityPosts(communityDbPath, statusFilter = null) {
  const normalized = statusFilter ? validateCommunityStatus(statusFilter) : null;
  try {
    await connectPublisherDb();
    const filter = normalized ? { status: normalized } : {};
    return CommunityPost.find(filter).sort({ createdAt: -1 }).lean();
  } catch (error) {
    const posts = loadJsonFile(communityDbPath, []);
    if (!normalized) return posts;
    return posts.filter((p) => {
      try {
        return validateCommunityStatus(p.status || '') === normalized;
      } catch {
        return false;
      }
    });
  }
}

async function updateCommunityPostStatus(communityDbPath, id, status, adminComment = null, adminInfo = null) {
  const normalizedStatus = validateCommunityStatus(status);
  if (![COMMUNITY_STATUS.APPROVED, COMMUNITY_STATUS.REJECTED].includes(normalizedStatus)) {
    throw new Error('Status must be APPROVED or REJECTED for moderation');
  }
  const normalizedComment = adminComment ? String(adminComment).trim() : '';
  if (normalizedStatus === 'REJECTED' && !normalizedComment) {
    throw new Error('Rejection reason(comment) is required when status is REJECTED');
  }
  const normalizedAdmin = {
    id: String(adminInfo?.id || '').trim(),
    name: String(adminInfo?.name || '').trim(),
    email: String(adminInfo?.email || '').trim().toLowerCase()
  };
  const logEntry = {
    action: normalizedStatus,
    status: normalizedStatus,
    comment: normalizedComment,
    admin: normalizedAdmin,
    date: new Date()
  };

  try {
    await connectPublisherDb();
    const query = { $or: [{ id }, { projectId: id }] };
    const updateOps = {
      $set: { status: normalizedStatus },
      $push: {
        moderationLogs: logEntry
      }
    };
    if (normalizedComment) {
      updateOps.$push.adminComments = {
        action: normalizedStatus,
        comment: normalizedComment,
        date: new Date()
      };
    }
    const updated = await CommunityPost.findOneAndUpdate(query, updateOps, {
      new: true
    });
    if (!updated) throw new Error('Project not found');
    return updated.toObject();
  } catch (error) {
    const posts = loadJsonFile(communityDbPath, []);
    const index = posts.findIndex((p) => p.id === id || p.projectId === id);
    if (index === -1) throw new Error('Project not found');
    posts[index].status = normalizedStatus;
    posts[index].updatedAt = new Date().toISOString();
    if (!posts[index].moderationLogs) posts[index].moderationLogs = [];
    posts[index].moderationLogs.push({
      ...logEntry,
      date: new Date().toISOString()
    });
    if (normalizedComment) {
      if (!posts[index].adminComments) posts[index].adminComments = [];
      posts[index].adminComments.push({
        action: normalizedStatus,
        comment: normalizedComment,
        date: new Date().toISOString()
      });
    }
    saveJsonFile(communityDbPath, posts);
    return posts[index];
  }
}

export { submitCommunityPost, listCommunityPosts, updateCommunityPostStatus, validateCommunityStatus };
