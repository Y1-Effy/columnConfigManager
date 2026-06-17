import request from 'supertest';

import app from '../server.js';
import Category from '../src/models/Category.js';
import Column from '../src/models/Column.js';
import OperationLog from '../src/models/OperationLog.js';
import Project from '../src/models/Project.js';
import Snapshot from '../src/models/Snapshot.js';

import { FAKE_ID, setupTestDB } from './mongoHelper.js';

setupTestDB();

describe('Projects API', () => {
  describe('POST /api/projects', () => {
    it('creates a project and returns 201', async() => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test Project', description: 'A test' });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Test Project');
      expect(res.body.error).toBeNull();
    });

    it('returns 400 when name is missing', async() => {
      const res = await request(app)
        .post('/api/projects')
        .send({ description: 'No name' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });
  });

  describe('GET /api/projects', () => {
    it('returns all projects', async() => {
      await Project.create([{ name: 'Alpha' }, { name: 'Beta' }]);
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns a project by id', async() => {
      const project = await Project.create({ name: 'Target' });
      const res = await request(app).get(`/api/projects/${project._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Target');
    });

    it('returns 400 for invalid id format', async() => {
      const res = await request(app).get('/api/projects/not-an-id');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent id', async() => {
      const res = await request(app).get(`/api/projects/${FAKE_ID}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/projects/:id', () => {
    it('updates a project', async() => {
      const project = await Project.create({ name: 'Old Name' });
      const res = await request(app)
        .put(`/api/projects/${project._id}`)
        .send({ name: 'New Name' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('New Name');
    });

    it('returns 404 for non-existent id', async() => {
      const res = await request(app)
        .put(`/api/projects/${FAKE_ID}`)
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('deletes a project', async() => {
      const project = await Project.create({ name: 'To Delete' });
      const res = await request(app).delete(`/api/projects/${project._id}`);
      expect(res.status).toBe(200);
      expect(res.body.error).toBeNull();
      const found = await Project.findById(project._id);
      expect(found).toBeNull();
    });

    it('deletes related categories, columns, operation logs, and snapshots (cascade)', async() => {
      const project = await Project.create({ name: 'Cascade Target' });
      const category = await Category.create({ projectId: project._id, name: 'Cat', order: 0 });
      await Column.create({ projectId: project._id, categoryId: category._id, key: 'k', label: 'K', order: 0 });
      await OperationLog.create({
        projectId: project._id,
        operations: [{ entityType: 'category', entityId: String(category._id), action: 'created', label: 'Cat', fields: [] }],
      });
      await Snapshot.create({
        projectId: project._id, projectName: project.name, categories: [], columns: [], hash: 'abc',
      });
      await request(app).delete(`/api/projects/${project._id}`);
      expect(await Category.findOne({ projectId: project._id })).toBeNull();
      expect(await Column.findOne({ projectId: project._id })).toBeNull();
      expect(await OperationLog.findOne({ projectId: project._id })).toBeNull();
      expect(await Snapshot.findOne({ projectId: project._id })).toBeNull();
    });

    it('returns 404 for non-existent id', async() => {
      const res = await request(app).delete(`/api/projects/${FAKE_ID}`);
      expect(res.status).toBe(404);
    });
  });
});
