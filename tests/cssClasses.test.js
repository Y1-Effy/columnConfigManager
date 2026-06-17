import request from 'supertest';

import app from '../server.js';
import Column from '../src/models/Column.js';
import CssClass from '../src/models/CssClass.js';

import { FAKE_ID, createProject, setupTestDB } from './mongoHelper.js';

setupTestDB();

describe('CssClasses API', () => {
  describe('POST /api/css-classes', () => {
    it('creates a css class and returns 201', async() => {
      const res = await request(app)
        .post('/api/css-classes')
        .send({ value: 'cell-center', description: '中央寄せ' });
      expect(res.status).toBe(201);
      expect(res.body.data.value).toBe('cell-center');
    });

    it('returns 400 when value is missing', async() => {
      const res = await request(app)
        .post('/api/css-classes')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('returns 409 when same value already exists', async() => {
      await CssClass.create({ value: 'cell-center' });
      const res = await request(app)
        .post('/api/css-classes')
        .send({ value: 'cell-center' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBeTruthy();
    });
  });

  describe('GET /api/css-classes', () => {
    it('returns css classes sorted by order', async() => {
      await CssClass.create([
        { value: 'cell-right', order: 2 },
        { value: 'cell-left', order: 1 },
      ]);
      const res = await request(app).get('/api/css-classes');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].value).toBe('cell-left');
    });
  });

  describe('PUT /api/css-classes/:id', () => {
    it('updates a css class and returns 200', async() => {
      const cssClass = await CssClass.create({ value: 'cell-center' });
      const res = await request(app)
        .put(`/api/css-classes/${cssClass._id}`)
        .send({ description: 'updated' });
      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('updated');
    });

    it('returns 404 for non-existent css class', async() => {
      const res = await request(app)
        .put(`/api/css-classes/${FAKE_ID}`)
        .send({ description: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns 409 when updating to an existing value', async() => {
      await CssClass.create({ value: 'cell-center' });
      const cssClass = await CssClass.create({ value: 'cell-right' });
      const res = await request(app)
        .put(`/api/css-classes/${cssClass._id}`)
        .send({ value: 'cell-center' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBeTruthy();
    });

    it('allows updating other fields without triggering 409', async() => {
      const cssClass = await CssClass.create({ value: 'cell-center' });
      const res = await request(app)
        .put(`/api/css-classes/${cssClass._id}`)
        .send({ description: '中央寄せ' });
      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('中央寄せ');
    });
  });

  describe('DELETE /api/css-classes/:id', () => {
    it('deletes a css class', async() => {
      const cssClass = await CssClass.create({ value: 'cell-center' });
      const res = await request(app).delete(`/api/css-classes/${cssClass._id}`);
      expect(res.status).toBe(200);
      const found = await CssClass.findById(cssClass._id);
      expect(found).toBeNull();
    });

    it('returns 400 when css class is in use by a column', async() => {
      const cssClass = await CssClass.create({ value: 'cell-center' });
      const project = await createProject();
      await Column.create({ projectId: project._id, key: 'col1', label: '列1', cssClassIds: [cssClass._id] });
      const res = await request(app).delete(`/api/css-classes/${cssClass._id}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('returns 404 for non-existent css class', async() => {
      const res = await request(app).delete(`/api/css-classes/${FAKE_ID}`);
      expect(res.status).toBe(404);
    });
  });
});
