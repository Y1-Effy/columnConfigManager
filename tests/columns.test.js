import request from 'supertest';

import app from '../server.js';
import Column from '../src/models/Column.js';
import Format from '../src/models/Format.js';

import { FAKE_ID, createProject, setupTestDB } from './mongoHelper.js';

setupTestDB();

describe('Columns API', () => {
  let project;

  beforeEach(async() => {
    project = await createProject();
  });

  describe('POST /api/projects/:id/columns', () => {
    it('creates a column and returns 201', async() => {
      const res = await request(app)
        .post(`/api/projects/${project._id}/columns`)
        .send({ key: 'user_name', label: 'User Name', dataType: 'string', order: 0 });
      expect(res.status).toBe(201);
      expect(res.body.data.key).toBe('user_name');
      expect(res.body.data.label).toBe('User Name');
    });

    it('returns 400 when key or label is missing', async() => {
      const res = await request(app)
        .post(`/api/projects/${project._id}/columns`)
        .send({ key: 'no_label' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent project', async() => {
      const res = await request(app)
        .post(`/api/projects/${FAKE_ID}/columns`)
        .send({ key: 'x', label: 'X' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when the format dataType does not match the column dataType', async() => {
      const format = await Format.create({ dataType: 'Date', value: 'yyyy/MM/dd' });
      const res = await request(app)
        .post(`/api/projects/${project._id}/columns`)
        .send({ key: 'amount', label: 'Amount', dataType: 'number', formatId: format._id.toString() });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/projects/:id/columns', () => {
    it('returns columns sorted by order', async() => {
      await Column.create([
        { projectId: project._id, key: 'b', label: 'B', order: 2 },
        { projectId: project._id, key: 'a', label: 'A', order: 1 },
      ]);
      const res = await request(app).get(`/api/projects/${project._id}/columns`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].key).toBe('a');
    });
  });

  describe('PUT /api/columns/:columnId', () => {
    it('updates a column', async() => {
      const column = await Column.create({
        projectId: project._id, key: 'old_key', label: 'Old Label',
      });
      const res = await request(app)
        .put(`/api/columns/${column._id}`)
        .send({ label: 'New Label' });
      expect(res.status).toBe(200);
      expect(res.body.data.label).toBe('New Label');
    });

    it('returns 404 for non-existent column', async() => {
      const res = await request(app)
        .put(`/api/columns/${FAKE_ID}`)
        .send({ label: 'X' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when the format dataType does not match the existing column dataType', async() => {
      const format = await Format.create({ dataType: 'Date', value: 'yyyy/MM/dd' });
      const column = await Column.create({
        projectId: project._id, key: 'amount', label: 'Amount', dataType: 'number',
      });
      const res = await request(app)
        .put(`/api/columns/${column._id}`)
        .send({ formatId: format._id.toString() });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/columns/:columnId', () => {
    it('deletes a column', async() => {
      const column = await Column.create({
        projectId: project._id, key: 'to_delete', label: 'To Delete',
      });
      const res = await request(app).delete(`/api/columns/${column._id}`);
      expect(res.status).toBe(200);
      const found = await Column.findById(column._id);
      expect(found).toBeNull();
    });
  });

  describe('POST /api/projects/:id/columns/reorder', () => {
    it('reorders columns by assigning order = index', async() => {
      const colA = await Column.create({ projectId: project._id, key: 'a', label: 'A', order: 0 });
      const colB = await Column.create({ projectId: project._id, key: 'b', label: 'B', order: 1 });
      const colC = await Column.create({ projectId: project._id, key: 'c', label: 'C', order: 2 });

      const res = await request(app)
        .post(`/api/projects/${project._id}/columns/reorder`)
        .send({ ids: [colC._id.toString(), colA._id.toString(), colB._id.toString()] });
      expect(res.status).toBe(200);

      const updated = await Column.find({ projectId: project._id }).sort({ order: 1 });
      expect(updated[0].key).toBe('c');
      expect(updated[1].key).toBe('a');
      expect(updated[2].key).toBe('b');
    });

    it('returns 400 when ids is not an array', async() => {
      const res = await request(app)
        .post(`/api/projects/${project._id}/columns/reorder`)
        .send({ ids: 'not-an-array' });
      expect(res.status).toBe(400);
    });
  });
});
