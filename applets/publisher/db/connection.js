import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/qoom2';

let mongoConnectPromise = null;

async function connectPublisherDb() {
  if (mongoose.connection.readyState === 1) return;
  if (mongoConnectPromise) return mongoConnectPromise;
  mongoConnectPromise = mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 1200
  });
  try {
    return await mongoConnectPromise;
  } catch (error) {
    mongoConnectPromise = null;
    throw error;
  }
}

export { connectPublisherDb };
