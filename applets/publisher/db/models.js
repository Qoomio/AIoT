import mongoose from 'mongoose';

const COMMUNITY_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

const COMMUNITY_CONTENT_TYPE = {
  ORIGINAL: 'ORIGINAL',
  FORK: 'FORK',
  REMIX: 'REMIX',
  SHARE: 'SHARE',
  NOTICE: 'NOTICE'
};

const COMMUNITY_CONTENT_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
  HIDDEN: 'HIDDEN'
};

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
    status: {
      type: String,
      enum: Object.values(COMMUNITY_STATUS),
      default: COMMUNITY_STATUS.DRAFT,
      index: true
    },
    submitter: {
      id: { type: String, default: '' },
      name: { type: String, default: '' },
      email: { type: String, default: '' }
    },
    metadata: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      tags: { type: [String], default: [] },
      repoUrl: { type: String, default: '' },
      liveUrl: { type: String, default: '' },
      thumbnailUrl: { type: String, default: '' },
      category: { type: String, default: '' }
    },
    adminComments: [
      {
        action: String,
        comment: String,
        date: Date
      }
    ],
    moderationLogs: [
      {
        action: { type: String, default: '' },
        status: { type: String, default: '' },
        comment: { type: String, default: '' },
        admin: {
          id: { type: String, default: '' },
          name: { type: String, default: '' },
          email: { type: String, default: '' }
        },
        date: Date
      }
    ]
  },
  { timestamps: true, strict: false, collection: 'publisher_community_posts' }
);

const communityCommentSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    authorName: { type: String, default: '' },
    authorAvatarUrl: { type: String, default: '' },
    title: { type: String, default: '' },
    content: { type: String, required: true },
    tag: { type: String, enum: ['question', 'answer', 'idea'], default: 'question' },
    parentId: { type: String, default: null, index: true }
  },
  { timestamps: true, collection: 'community_comments' }
);

const communitySaveSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true },
    snapshot: { type: Object, default: {} }
  },
  { timestamps: true, collection: 'community_saves' }
);
communitySaveSchema.index({ userId: 1, projectId: 1 }, { unique: true });

const communityNoteSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, default: '' },
    content: { type: String, default: '' }
  },
  { timestamps: true, collection: 'community_notes' }
);

const communityLikeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true }
  },
  { timestamps: true, collection: 'community_likes' }
);
communityLikeSchema.index({ userId: 1, projectId: 1 }, { unique: true });

const commentLikeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    commentId: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true }
  },
  { timestamps: true, collection: 'community_comment_likes' }
);
commentLikeSchema.index({ userId: 1, commentId: 1 }, { unique: true });

const communityFollowSchema = new mongoose.Schema(
  {
    followerId: { type: String, required: true, index: true },
    followerName: { type: String, default: '' },
    followingId: { type: String, required: true, index: true }
  },
  { timestamps: true, collection: 'community_follows' }
);
communityFollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

const communityNotificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: ['like', 'comment', 'follow', 'mention'], required: true },
    fromUserId: { type: String, default: '' },
    fromUserName: { type: String, default: '' },
    projectId: { type: String, default: '' },
    projectTitle: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true }
  },
  { timestamps: true, collection: 'community_notifications' }
);

const communityContentSchema = new mongoose.Schema(
  {
    contentId: { type: String, unique: true, index: true },
    contentType: {
      type: String,
      enum: Object.values(COMMUNITY_CONTENT_TYPE),
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: Object.values(COMMUNITY_CONTENT_STATUS),
      default: COMMUNITY_CONTENT_STATUS.DRAFT,
      index: true
    },
    title: { type: String, default: '', index: true },
    summary: { type: String, default: '' },
    description: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    author: {
      userId: { type: String, default: '', index: true },
      name: { type: String, default: '' },
      email: { type: String, default: '' }
    },
    categoryIds: { type: [String], default: [], index: true },
    tags: { type: [String], default: [] },
    visibility: {
      isPublic: { type: Boolean, default: true, index: true },
      isPinned: { type: Boolean, default: false, index: true }
    },
    stats: {
      views: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      clones: { type: Number, default: 0 },
      forkCount: { type: Number, default: 0 },
      remixCount: { type: Number, default: 0 }
    },
    search: {
      keywords: { type: [String], default: [] },
      originalRootId: { type: String, default: '', index: true },
      baseProjectId: { type: String, default: '' }
    },
    shareLink: {
      url: { type: String, default: '' },
      domain: { type: String, default: '' },
      previewImageUrl: { type: String, default: '' },
      previewTitle: { type: String, default: '' },
      previewDescription: { type: String, default: '' }
    },
    notice: {
      isImportant: { type: Boolean, default: false },
      pinnedUntil: { type: Date, default: null }
    },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true, collection: 'community_contents' }
);

communityContentSchema.index({ contentType: 1, status: 1, publishedAt: -1 });
communityContentSchema.index({ 'author.userId': 1, createdAt: -1 });
communityContentSchema.index({ categoryIds: 1, contentType: 1, publishedAt: -1 });
communityContentSchema.index({ 'search.originalRootId': 1, contentType: 1 });
communityContentSchema.index({ 'search.baseProjectId': 1 });
communityContentSchema.index({ 'stats.clones': -1, 'stats.likes': -1 });
communityContentSchema.index({ title: 'text', summary: 'text', description: 'text', tags: 'text' });

const communityForkRelationSchema = new mongoose.Schema(
  {
    childContentId: { type: String, required: true, unique: true, index: true },
    parentContentId: { type: String, required: true, index: true },
    rootContentId: { type: String, required: true, index: true },
    depth: { type: Number, required: true, min: 1, index: true },
    path: { type: [String], default: [] }
  },
  { timestamps: true, collection: 'community_fork_relations' }
);
communityForkRelationSchema.index({ rootContentId: 1, depth: 1 });

const communityRemixSourceSchema = new mongoose.Schema(
  {
    remixContentId: { type: String, required: true, index: true },
    sourceContentId: { type: String, required: true, index: true },
    order: { type: Number, default: 0 },
    relationType: { type: String, default: 'SOURCE' }
  },
  { timestamps: true, collection: 'community_remix_sources' }
);
communityRemixSourceSchema.index({ remixContentId: 1, order: 1 });
communityRemixSourceSchema.index({ remixContentId: 1, sourceContentId: 1 }, { unique: true });

const communityCategorySchema = new mongoose.Schema(
  {
    categoryId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true, collection: 'community_categories' }
);

const GitHubConfig = mongoose.models.GitHubConfig || mongoose.model('GitHubConfig', gitHubConfigSchema);
const CommunityPost = mongoose.models.CommunityPost || mongoose.model('CommunityPost', communityPostSchema);
const CommunityNote = mongoose.models.CommunityNote || mongoose.model('CommunityNote', communityNoteSchema);
const CommunitySave = mongoose.models.CommunitySave || mongoose.model('CommunitySave', communitySaveSchema);
const CommunityComment = mongoose.models.CommunityComment || mongoose.model('CommunityComment', communityCommentSchema);
const CommunityLike = mongoose.models.CommunityLike || mongoose.model('CommunityLike', communityLikeSchema);
const CommentLike = mongoose.models.CommentLike || mongoose.model('CommentLike', commentLikeSchema);
const CommunityFollow = mongoose.models.CommunityFollow || mongoose.model('CommunityFollow', communityFollowSchema);
const CommunityNotification = mongoose.models.CommunityNotification || mongoose.model('CommunityNotification', communityNotificationSchema);
const CommunityContent = mongoose.models.CommunityContent || mongoose.model('CommunityContent', communityContentSchema);
const CommunityForkRelation = mongoose.models.CommunityForkRelation || mongoose.model('CommunityForkRelation', communityForkRelationSchema);
const CommunityRemixSource = mongoose.models.CommunityRemixSource || mongoose.model('CommunityRemixSource', communityRemixSourceSchema);
const CommunityCategory = mongoose.models.CommunityCategory || mongoose.model('CommunityCategory', communityCategorySchema);

export {
  GitHubConfig,
  CommunityPost,
  CommunityNote,
  CommunitySave,
  CommunityComment,
  CommunityLike,
  CommentLike,
  CommunityFollow,
  CommunityNotification,
  CommunityContent,
  CommunityForkRelation,
  CommunityRemixSource,
  CommunityCategory,
  COMMUNITY_STATUS,
  COMMUNITY_CONTENT_TYPE,
  COMMUNITY_CONTENT_STATUS
};
