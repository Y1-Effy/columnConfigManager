import mongoose from 'mongoose';

/**
 * MongoDBに接続する。MONGO_URI環境変数が未設定の場合はエラーをスローする。
 * @returns {Promise<void>}
 */
const connectDB = async() => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set in environment variables');
  }
  await mongoose.connect(uri);
  console.log('MongoDB connected');
};

export default connectDB;
