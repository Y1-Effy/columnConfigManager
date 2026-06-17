import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import Project from '../src/models/Project.js';

let mongod;

const FAKE_ID = '000000000000000000000000';

const connect = async() => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
};

const disconnect = async() => {
  await mongoose.disconnect();
  await mongod.stop();
};

const clearCollections = async() => {
  const collections = Object.values(mongoose.connection.collections);
  for (const collection of collections) {
    await collection.deleteMany({});
  }
};

const setupTestDB = () => {
  beforeAll(connect);
  afterAll(disconnect);
  beforeEach(clearCollections);
};

const createProject = (name = 'Test Project') => Project.create({ name });

export { FAKE_ID, clearCollections, connect, createProject, disconnect, setupTestDB };
