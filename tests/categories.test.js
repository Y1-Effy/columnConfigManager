import request from 'supertest';

import app from '../server.js';
import Category from '../src/models/Category.js';
import Column from '../src/models/Column.js';

import { FAKE_ID, createProject, setupTestDB } from './mongoHelper.js';

setupTestDB();

describe('Categories API', () => {
  let project;

  beforeEach(async() => {
    project = await createProject();
  });

  describe('POST /api/projects/:id/categories', () => {
    it('creates a category and returns 201', async() => {
      const res = await request(app)
        .post(`/api/projects/${project._id}/categories`)
        .send({ name: 'Basic Info', order: 0 });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Basic Info');
      expect(res.body.data.projectId).toBe(project._id.toString());
    });

    it('returns 400 when name is missing', async() => {
      const res = await request(app)
        .post(`/api/projects/${project._id}/categories`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('returns 404 for non-existent project', async() => {
      const res = await request(app)
        .post(`/api/projects/${FAKE_ID}/categories`)
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/projects/:id/categories', () => {
    it('returns categories sorted by order', async() => {
      await Category.create([
        { projectId: project._id, name: 'B', order: 2 },
        { projectId: project._id, name: 'A', order: 1 },
      ]);
      const res = await request(app).get(`/api/projects/${project._id}/categories`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('A');
    });
  });

  describe('PUT /api/categories/:categoryId', () => {
    it('updates a category', async() => {
      const category = await Category.create({ projectId: project._id, name: 'Old' });
      const res = await request(app)
        .put(`/api/categories/${category._id}`)
        .send({ name: 'New' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('New');
    });

    it('returns 404 for non-existent category', async() => {
      const res = await request(app)
        .put(`/api/categories/${FAKE_ID}`)
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/categories/:categoryId', () => {
    it('deletes a category', async() => {
      const category = await Category.create({ projectId: project._id, name: 'ToDelete' });
      const res = await request(app).delete(`/api/categories/${category._id}`);
      expect(res.status).toBe(200);
      const found = await Category.findById(category._id);
      expect(found).toBeNull();
    });

    it('deletes columns under the category (cascade)', async() => {
      const category = await Category.create({ projectId: project._id, name: 'WithColumns', order: 0 });
      await Column.create({ projectId: project._id, categoryId: category._id, key: 'col1', label: '列1', order: 0 });
      await request(app).delete(`/api/categories/${category._id}`);
      const col = await Column.findOne({ categoryId: category._id });
      expect(col).toBeNull();
    });
  });
});
