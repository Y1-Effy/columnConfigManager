import request from 'supertest';

import app from '../server.js';
import Column from '../src/models/Column.js';
import Format from '../src/models/Format.js';

import { FAKE_ID, createProject, setupTestDB } from './mongoHelper.js';

setupTestDB();

describe('Formats API', () => {
  describe('POST /api/formats', () => {
    it('creates a format and returns 201', async() => {
      const res = await request(app)
        .post('/api/formats')
        .send({ dataType: 'Date', value: 'yyyy/MM/dd', description: '年/月/日' });
      expect(res.status).toBe(201);
      expect(res.body.data.value).toBe('yyyy/MM/dd');
      expect(res.body.data.dataType).toBe('Date');
    });

    it('returns 400 when dataType is missing', async() => {
      const res = await request(app)
        .post('/api/formats')
        .send({ value: 'yyyy/MM/dd' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('returns 400 when value is missing', async() => {
      const res = await request(app)
        .post('/api/formats')
        .send({ dataType: 'Date' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('returns 409 when same dataType+value already exists', async() => {
      await Format.create({ dataType: 'Date', value: 'yyyy/MM/dd' });
      const res = await request(app)
        .post('/api/formats')
        .send({ dataType: 'Date', value: 'yyyy/MM/dd' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBeTruthy();
    });
  });

  describe('GET /api/formats', () => {
    it('returns formats sorted by order', async() => {
      await Format.create([
        { dataType: 'Number', value: 'n2', order: 2 },
        { dataType: 'Date', value: 'yyyy/MM/dd', order: 1 },
      ]);
      const res = await request(app).get('/api/formats');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].value).toBe('yyyy/MM/dd');
    });
  });

  describe('PUT /api/formats/:id', () => {
    it('updates a format and returns 200', async() => {
      const format = await Format.create({ dataType: 'Date', value: 'yyyy/MM/dd' });
      const res = await request(app)
        .put(`/api/formats/${format._id}`)
        .send({ description: 'updated' });
      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('updated');
    });

    it('returns 404 for non-existent format', async() => {
      const res = await request(app)
        .put(`/api/formats/${FAKE_ID}`)
        .send({ description: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns 409 when updating to an existing dataType+value combination', async() => {
      await Format.create({ dataType: 'Date', value: 'yyyy/MM/dd' });
      const format = await Format.create({ dataType: 'Date', value: 'yyyy/M/d' });
      const res = await request(app)
        .put(`/api/formats/${format._id}`)
        .send({ dataType: 'Date', value: 'yyyy/MM/dd' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBeTruthy();
    });

    it('allows updating other fields without triggering 409', async() => {
      const format = await Format.create({ dataType: 'Date', value: 'yyyy/MM/dd' });
      const res = await request(app)
        .put(`/api/formats/${format._id}`)
        .send({ description: '年/月/日' });
      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('年/月/日');
    });
  });

  describe('DELETE /api/formats/:id', () => {
    it('deletes a format', async() => {
      const format = await Format.create({ dataType: 'Date', value: 'yyyy/MM/dd' });
      const res = await request(app).delete(`/api/formats/${format._id}`);
      expect(res.status).toBe(200);
      const found = await Format.findById(format._id);
      expect(found).toBeNull();
    });

    it('returns 400 when format is in use by a column', async() => {
      const format = await Format.create({ dataType: 'Date', value: 'yyyy/MM/dd' });
      const project = await createProject();
      await Column.create({ projectId: project._id, key: 'col1', label: '列1', formatId: format._id });
      const res = await request(app).delete(`/api/formats/${format._id}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('returns 404 for non-existent format', async() => {
      const res = await request(app).delete(`/api/formats/${FAKE_ID}`);
      expect(res.status).toBe(404);
    });
  });
});
