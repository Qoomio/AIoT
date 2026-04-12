import { connectPublisherDb } from './connection.js';
import { GitHubConfig } from './models.js';
import { loadJsonFile, saveJsonFile } from './json-store.js';

async function saveGitHubConfigRecord(configFilePath, token, username = '') {
  try {
    await connectPublisherDb();
    const saved = await GitHubConfig.findOneAndUpdate(
      { key: 'default' },
      { token, username },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return saved?.toObject() || { token, username };
  } catch (error) {
    const config = { token, username, updatedAt: new Date().toISOString() };
    saveJsonFile(configFilePath, config);
    return config;
  }
}

async function getGitHubTokenRecord(configFilePath) {
  try {
    await connectPublisherDb();
    const config = await GitHubConfig.findOne({ key: 'default' }).lean();
    return config?.token || null;
  } catch (error) {
    const config = loadJsonFile(configFilePath, {});
    return config?.token || null;
  }
}

export { saveGitHubConfigRecord, getGitHubTokenRecord };
