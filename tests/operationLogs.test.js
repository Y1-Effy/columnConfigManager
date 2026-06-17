import request from 'supertest';

import app from '../server.js';
import OperationLog from '../src/models/OperationLog.js';

import { FAKE_ID, createProject, setupTestDB } from './mongoHelper.js';

setupTestDB();

describe('GET /api/projects/:id/operation-logs', () => {
  let project;

  beforeEach(async() => {
    project = await createProject();
  });

  it('returns 400 for an invalid project id', async() => {
    const res = await request(app).get('/api/projects/bad-id/operation-logs');
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent project', async() => {
    const res = await request(app).get(`/api/projects/${FAKE_ID}/operation-logs`);
    expect(res.status).toBe(404);
  });

  it('returns an empty array when no logs exist', async() => {
    const res = await request(app).get(`/api/projects/${project._id}/operation-logs`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns logs sorted newest first', async() => {
    const opEntry = (label) => ({ entityType: 'category', entityId: FAKE_ID, action: 'created', label, fields: [] });
    await OperationLog.create({ projectId: project._id, operations: [opEntry('first')] });
    await OperationLog.create({ projectId: project._id, operations: [opEntry('second')] });

    const res = await request(app).get(`/api/projects/${project._id}/operation-logs`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].operations[0].label).toBe('second');
    expect(res.body.data[1].operations[0].label).toBe('first');
  });
});
