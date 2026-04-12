import mongoose from 'mongoose';

const COMMUNITY_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
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

const GitHubConfig =
  mongoose.models.GitHubConfig || mongoose.model('GitHubConfig', gitHubConfigSchema);
const CommunityPost =
  mongoose.models.CommunityPost || mongoose.model('CommunityPost', communityPostSchema);

export { GitHubConfig, CommunityPost, COMMUNITY_STATUS };
