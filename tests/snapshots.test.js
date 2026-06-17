import request from 'supertest';

import app from '../server.js';
import Category from '../src/models/Category.js';
import Column from '../src/models/Column.js';
import OperationLog from '../src/models/OperationLog.js';
import Snapshot from '../src/models/Snapshot.js';

import { FAKE_ID, createProject, setupTestDB } from './mongoHelper.js';

setupTestDB();

describe('POST /api/projects/:id/snapshots', () => {
  let project;

  beforeEach(async() => {
    project = await createProject();
  });

  it('returns 400 for an invalid project id', async() => {
    const res = await request(app).post('/api/projects/bad-id/snapshots').send({ categories: [], columns: [] });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent project', async() => {
    const res = await request(app).post(`/api/projects/${FAKE_ID}/snapshots`).send({ categories: [], columns: [] });
    expect(res.status).toBe(404);
  });

  it('returns 400 when categories/columns are not arrays', async() => {
    const res = await request(app).post(`/api/projects/${project._id}/snapshots`).send({ categories: {}, columns: [] });
    expect(res.status).toBe(400);
  });

  it('creates a new snapshot with projectName, hash, and savedAt', async() => {
    const categories = [{ _id: 'cat-1', name: 'Cat', order: 0 }];
    const columns = [{ _id: 'col-1', categoryId: 'cat-1', key: 'k', label: 'K', order: 0 }];

    const res = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories, columns });

    expect(res.status).toBe(201);
    expect(res.body.data.duplicated).toBe(false);
    expect(res.body.data.snapshot.projectName).toBe(project.name);
    expect(res.body.data.snapshot.hash).toBeTruthy();
    expect(res.body.data.snapshot.savedAt).toBeTruthy();
    expect(await Snapshot.countDocuments({ projectId: project._id })).toBe(1);
  });

  it('returns unchanged when content and name are the same within the same day', async() => {
    const categories = [{ _id: 'cat-1', name: 'Cat', order: 0 }];
    const columns = [{ _id: 'col-1', categoryId: 'cat-1', key: 'k', label: 'K', order: 0 }];

    const first = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories, columns });

    const second = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories, columns });

    expect(second.status).toBe(200);
    expect(second.body.data.duplicated).toBe(true);
    expect(second.body.data.unchanged).toBe(true);
    expect(second.body.data.snapshot._id).toBe(first.body.data.snapshot._id);
    expect(await Snapshot.countDocuments({ projectId: project._id })).toBe(1);
  });

  it('treats drafts with different temporary/real _ids as identical when content matches', async() => {
    const draftCategories = [{ _id: 'new-cat-1', name: 'Cat', order: 0 }];
    const draftColumns = [{ _id: 'new-col-1', categoryId: 'new-cat-1', key: 'k', label: 'K', order: 0 }];

    const first = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories: draftCategories, columns: draftColumns });
    expect(first.status).toBe(201);

    const savedCategories = [{ _id: '507f1f77bcf86cd799439011', name: 'Cat', order: 0 }];
    const savedColumns = [{ _id: '507f1f77bcf86cd799439012', categoryId: '507f1f77bcf86cd799439011', key: 'k', label: 'K', order: 0 }];

    const second = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories: savedCategories, columns: savedColumns });

    expect(second.status).toBe(200);
    expect(second.body.data.duplicated).toBe(true);
    expect(await Snapshot.countDocuments({ projectId: project._id })).toBe(1);
  });

  it('keeps only the latest 5 snapshots per project, removing the oldest', async() => {
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post(`/api/projects/${project._id}/snapshots`)
        .send({ categories: [], columns: [{ _id: `col-${i}`, key: `k${i}`, label: `L${i}`, order: i }] });
      expect(res.status).toBe(201);
    }

    const remaining = await Snapshot.find({ projectId: project._id }).sort({ savedAt: 1, _id: 1 });
    expect(remaining).toHaveLength(5);
    expect(remaining[0].columns[0]._id).toBe('col-1');
    expect(remaining[4].columns[0]._id).toBe('col-5');
  });

  it('records an operation log entry when a new restore point is saved', async() => {
    const categories = [{ _id: 'cat-1', name: 'Cat', order: 0 }];
    const columns = [{ _id: 'col-1', categoryId: 'cat-1', key: 'k', label: 'K', order: 0 }];

    await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories, columns });

    const logs = await OperationLog.find({ projectId: project._id });
    expect(logs).toHaveLength(1);
    expect(logs[0].operations).toHaveLength(1);
    expect(logs[0].operations[0]).toMatchObject({ entityType: 'snapshot', action: 'created' });
  });

  it('records both a save and an oldest-deletion operation in one log when the 6th save exceeds the limit', async() => {
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post(`/api/projects/${project._id}/snapshots`)
        .send({ categories: [], columns: [{ _id: `col-${i}`, key: `k${i}`, label: `L${i}`, order: i }] });
    }

    const logs = await OperationLog.find({ projectId: project._id }).sort({ createdAt: 1, _id: 1 });
    expect(logs).toHaveLength(6);
    for (let i = 0; i < 5; i++) {
      expect(logs[i].operations).toHaveLength(1);
      expect(logs[i].operations[0]).toMatchObject({ entityType: 'snapshot', action: 'created' });
    }
    expect(logs[5].operations).toHaveLength(2);
    expect(logs[5].operations[0]).toMatchObject({ entityType: 'snapshot', action: 'created' });
    expect(logs[5].operations[1]).toMatchObject({ entityType: 'snapshot', action: 'deleted' });
  });

  it('does not record an operation log entry for a duplicate save on the same day', async() => {
    const categories = [{ _id: 'cat-1', name: 'Cat', order: 0 }];
    const columns = [{ _id: 'col-1', categoryId: 'cat-1', key: 'k', label: 'K', order: 0 }];

    await request(app).post(`/api/projects/${project._id}/snapshots`).send({ categories, columns });
    await request(app).post(`/api/projects/${project._id}/snapshots`).send({ categories, columns });

    const logs = await OperationLog.find({ projectId: project._id });
    expect(logs).toHaveLength(1);
  });

  it('records an operation log "updated" entry when a duplicate save updates the saved date', async() => {
    const categories = [{ _id: 'cat-1', name: 'Cat', order: 0 }];
    const columns = [{ _id: 'col-1', categoryId: 'cat-1', key: 'k', label: 'K', order: 0 }];

    const first = await request(app).post(`/api/projects/${project._id}/snapshots`).send({ categories, columns });
    const snapshotId = first.body.data.snapshot._id;

    await Snapshot.updateOne({ _id: snapshotId }, { savedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });

    await request(app).post(`/api/projects/${project._id}/snapshots`).send({ categories, columns });

    const logs = await OperationLog.find({ projectId: project._id }).sort({ createdAt: 1, _id: 1 });
    expect(logs).toHaveLength(2);
    expect(logs[1].operations).toHaveLength(1);
    expect(logs[1].operations[0]).toMatchObject({ entityType: 'snapshot', entityId: snapshotId, action: 'updated' });
    expect(logs[1].operations[0].fields[0].field).toBe('savedAt');
  });

  it('stores and returns the snapshot name on creation', async() => {
    const res = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories: [], columns: [], name: 'リリース前' });

    expect(res.status).toBe(201);
    expect(res.body.data.snapshot.name).toBe('リリース前');
  });

  it('uses empty string as default name when name is omitted', async() => {
    const res = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories: [], columns: [] });

    expect(res.status).toBe(201);
    expect(res.body.data.snapshot.name).toBe('');
  });

  it('updates the existing snapshot when name changes with identical content', async() => {
    const categories = [];
    const columns = [{ _id: 'col-1', key: 'k', label: 'K', order: 0 }];

    const first = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories, columns, name: 'v1' });
    expect(first.status).toBe(201);
    const snapshotId = first.body.data.snapshot._id;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const second = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories, columns, name: 'v2' });

    expect(second.status).toBe(200);
    expect(second.body.data.duplicated).toBe(true);
    expect(second.body.data.unchanged).toBe(false);
    expect(second.body.data.snapshot._id).toBe(snapshotId);
    expect(second.body.data.snapshot.name).toBe('v2');
    expect(await Snapshot.countDocuments({ projectId: project._id })).toBe(1);
  });

  it('treats same content with same name as duplicate', async() => {
    const categories = [{ _id: 'cat-1', name: 'Cat', order: 0 }];
    const columns = [{ _id: 'col-1', categoryId: 'cat-1', key: 'k', label: 'K', order: 0 }];

    const first = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories, columns, name: 'v1' });
    expect(first.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const second = await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories, columns, name: 'v1' });
    expect(second.status).toBe(200);
    expect(second.body.data.duplicated).toBe(true);
    expect(second.body.data.unchanged).toBe(true);
    expect(await Snapshot.countDocuments({ projectId: project._id })).toBe(1);
  });

  it('records an operation log when name changes on a duplicate save', async() => {
    const columns = [{ _id: 'col-1', key: 'k', label: 'K', order: 0 }];

    await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories: [], columns, name: 'v1' });

    const snapshotId = String((await Snapshot.findOne({ projectId: project._id }).lean())._id);

    await new Promise((resolve) => setTimeout(resolve, 10));

    await request(app)
      .post(`/api/projects/${project._id}/snapshots`)
      .send({ categories: [], columns, name: 'v2' });

    const logs = await OperationLog.find({ projectId: project._id }).sort({ createdAt: 1, _id: 1 });
    expect(logs).toHaveLength(2);
    expect(logs[1].operations[0].entityType).toBe('snapshot');
    expect(logs[1].operations[0].entityId).toBe(snapshotId);
    expect(logs[1].operations[0].action).toBe('updated');
    const nameField = logs[1].operations[0].fields.find((f) => f.field === 'name');
    expect(nameField.before).toBe('v1');
    expect(nameField.after).toBe('v2');
  });
});

describe('GET /api/projects/:id/snapshots', () => {
  let project;

  beforeEach(async() => {
    project = await createProject();
  });

  it('returns 400 for an invalid project id', async() => {
    const res = await request(app).get('/api/projects/bad-id/snapshots');
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent project', async() => {
    const res = await request(app).get(`/api/projects/${FAKE_ID}/snapshots`);
    expect(res.status).toBe(404);
  });

  it('returns an empty array when there are no snapshots', async() => {
    const res = await request(app).get(`/api/projects/${project._id}/snapshots`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns snapshots sorted by savedAt descending, with _id, savedAt, and name', async() => {
    const older = await Snapshot.create({
      projectId: project._id, projectName: project.name, categories: [], columns: [],
      hash: 'hash-older', savedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const newer = await Snapshot.create({
      projectId: project._id, projectName: project.name, name: 'v2', categories: [], columns: [],
      hash: 'hash-newer', savedAt: new Date('2026-02-01T00:00:00Z'),
    });

    const res = await request(app).get(`/api/projects/${project._id}/snapshots`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ _id: String(newer._id), name: 'v2' });
    expect(res.body.data[1]).toMatchObject({ _id: String(older._id), name: '' });
    expect(res.body.data[0].savedAt).toBeTruthy();
    expect(res.body.data[0].categories).toBeUndefined();
    expect(res.body.data[0].columns).toBeUndefined();
  });
});

describe('GET /api/projects/:id/snapshots/:snapshotId', () => {
  let project;

  beforeEach(async() => {
    project = await createProject();
  });

  it('returns 400 for an invalid project id', async() => {
    const res = await request(app).get(`/api/projects/bad-id/snapshots/${FAKE_ID}`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent project', async() => {
    const res = await request(app).get(`/api/projects/${FAKE_ID}/snapshots/${FAKE_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid snapshot id', async() => {
    const res = await request(app).get(`/api/projects/${project._id}/snapshots/bad-id`);
    expect(res.status).toBe(400);
  });

  it('returns 404 when the snapshot does not exist', async() => {
    const res = await request(app).get(`/api/projects/${project._id}/snapshots/${FAKE_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the snapshot belongs to a different project', async() => {
    const otherProject = await createProject();
    const snapshot = await Snapshot.create({
      projectId: otherProject._id, projectName: otherProject.name, categories: [], columns: [],
      hash: 'hash-other', savedAt: new Date(),
    });

    const res = await request(app).get(`/api/projects/${project._id}/snapshots/${snapshot._id}`);
    expect(res.status).toBe(404);
  });

  it('returns the snapshot detail with categories and columns', async() => {
    const categories = [{ _id: 'cat-1', name: 'Cat', order: 0 }];
    const columns = [{ _id: 'col-1', categoryId: 'cat-1', key: 'k', label: 'K', order: 0 }];
    const snapshot = await Snapshot.create({
      projectId: project._id, projectName: project.name, categories, columns,
      hash: 'hash-detail', savedAt: new Date(),
    });

    const res = await request(app).get(`/api/projects/${project._id}/snapshots/${snapshot._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ _id: String(snapshot._id), categories, columns });
    expect(res.body.data.savedAt).toBeTruthy();
  });
});

describe('GET /api/projects/:id/snapshots/:snapshotId/diff', () => {
  let project;

  beforeEach(async() => {
    project = await createProject();
  });

  it('returns 400 for an invalid project id', async() => {
    const res = await request(app).get(`/api/projects/bad-id/snapshots/${FAKE_ID}/diff`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent project', async() => {
    const res = await request(app).get(`/api/projects/${FAKE_ID}/snapshots/${FAKE_ID}/diff`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid snapshot id', async() => {
    const res = await request(app).get(`/api/projects/${project._id}/snapshots/bad-id/diff`);
    expect(res.status).toBe(400);
  });

  it('returns 404 when the snapshot does not exist', async() => {
    const res = await request(app).get(`/api/projects/${project._id}/snapshots/${FAKE_ID}/diff`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the snapshot belongs to a different project', async() => {
    const otherProject = await createProject();
    const snapshot = await Snapshot.create({
      projectId: otherProject._id, projectName: otherProject.name, categories: [], columns: [],
      hash: 'hash-other', savedAt: new Date(),
    });

    const res = await request(app).get(`/api/projects/${project._id}/snapshots/${snapshot._id}/diff`);
    expect(res.status).toBe(404);
  });

  it('computes the diff with before=current DB state and after=snapshot', async() => {
    const category = await Category.create({ projectId: project._id, name: 'CatNow', order: 0 });
    const column = await Column.create({
      projectId: project._id, categoryId: category._id, key: 'k', label: 'LabelNow', order: 0,
    });

    const snapshot = await Snapshot.create({
      projectId: project._id,
      projectName: project.name,
      categories: [{ _id: String(category._id), name: 'CatThen', order: 0 }],
      columns: [{
        _id: String(column._id), categoryId: String(category._id), key: 'k', label: 'LabelThen', order: 0, required: false,
      }],
      hash: 'hash-diff',
      savedAt: new Date(),
    });

    const res = await request(app).get(`/api/projects/${project._id}/snapshots/${snapshot._id}/diff`);
    expect(res.status).toBe(200);
    const { operations } = res.body.data;

    const categoryOp = operations.find((op) => op.entityType === 'category');
    expect(categoryOp).toMatchObject({ entityId: String(category._id), action: 'updated', label: 'CatThen' });
    expect(categoryOp.fields).toEqual([{ field: 'name', before: 'CatNow', after: 'CatThen' }]);

    const columnOp = operations.find((op) => op.entityType === 'column');
    expect(columnOp).toMatchObject({ entityId: String(column._id), action: 'updated', label: 'LabelThen' });
    expect(columnOp.fields).toEqual([{ field: 'label', before: 'LabelNow', after: 'LabelThen' }]);
  });

  it('returns an empty operations array when the snapshot matches the current DB state', async() => {
    const category = await Category.create({ projectId: project._id, name: 'Cat', order: 0 });
    const column = await Column.create({
      projectId: project._id, categoryId: category._id, key: 'k', label: 'Label', order: 0,
    });

    const snapshot = await Snapshot.create({
      projectId: project._id,
      projectName: project.name,
      categories: [{ _id: String(category._id), name: 'Cat', order: 0 }],
      columns: [{
        _id: String(column._id), categoryId: String(category._id), key: 'k', label: 'Label', order: 0, required: false,
      }],
      hash: 'hash-nodiff',
      savedAt: new Date(),
    });

    const res = await request(app).get(`/api/projects/${project._id}/snapshots/${snapshot._id}/diff`);
    expect(res.status).toBe(200);
    expect(res.body.data.operations).toEqual([]);
  });
});

describe('POST /api/projects/:id/snapshots/:snapshotId/restore', () => {
  let project;

  beforeEach(async() => {
    project = await createProject();
  });

  it('returns 400 for an invalid project id', async() => {
    const res = await request(app).post(`/api/projects/bad-id/snapshots/${FAKE_ID}/restore`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent project', async() => {
    const res = await request(app).post(`/api/projects/${FAKE_ID}/snapshots/${FAKE_ID}/restore`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid snapshot id', async() => {
    const res = await request(app).post(`/api/projects/${project._id}/snapshots/bad-id/restore`);
    expect(res.status).toBe(400);
  });

  it('returns 404 when the snapshot does not exist', async() => {
    const res = await request(app).post(`/api/projects/${project._id}/snapshots/${FAKE_ID}/restore`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the snapshot belongs to a different project', async() => {
    const otherProject = await createProject();
    const snapshot = await Snapshot.create({
      projectId: otherProject._id, projectName: otherProject.name, categories: [], columns: [],
      hash: 'hash-other', savedAt: new Date(),
    });

    const res = await request(app).post(`/api/projects/${project._id}/snapshots/${snapshot._id}/restore`);
    expect(res.status).toBe(404);
  });

  it('replaces the current categories/columns with the snapshot content', async() => {
    const category = await Category.create({ projectId: project._id, name: 'CatNow', order: 0 });
    await Column.create({ projectId: project._id, categoryId: category._id, key: 'k', label: 'LabelNow', order: 0 });

    const snapshot = await Snapshot.create({
      projectId: project._id,
      projectName: project.name,
      categories: [{ _id: '507f1f77bcf86cd799439011', name: 'CatThen', order: 0 }],
      columns: [{
        _id: '507f1f77bcf86cd799439012', categoryId: '507f1f77bcf86cd799439011', key: 'k2', label: 'LabelThen', order: 0,
      }],
      hash: 'hash-restore',
      savedAt: new Date(),
    });

    const res = await request(app).post(`/api/projects/${project._id}/snapshots/${snapshot._id}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toHaveLength(1);
    expect(res.body.data.categories[0].name).toBe('CatThen');
    expect(res.body.data.columns).toHaveLength(1);
    expect(res.body.data.columns[0].label).toBe('LabelThen');
    expect(res.body.data.columns[0].categoryId).toBe(res.body.data.categories[0]._id);

    expect(await Category.countDocuments({ projectId: project._id })).toBe(1);
    expect(await Column.countDocuments({ projectId: project._id })).toBe(1);

    const logs = await OperationLog.find({ projectId: project._id });
    expect(logs).toHaveLength(1);
  });

  it('restores a snapshot saved from an unsaved draft (temporary ids) without crashing or losing data', async() => {
    const category = await Category.create({ projectId: project._id, name: 'Existing', order: 0 });
    await Column.create({ projectId: project._id, categoryId: category._id, key: 'existing_key', label: 'Existing Col', order: 0 });

    const snapshot = await Snapshot.create({
      projectId: project._id,
      projectName: project.name,
      categories: [{ _id: 'new-cat-1', name: 'DraftCat', order: 0 }],
      columns: [{ _id: 'new-col-1', categoryId: 'new-cat-1', key: 'draft_key', label: 'DraftCol', order: 0 }],
      hash: 'hash-draft-restore',
      savedAt: new Date(),
    });

    const res = await request(app).post(`/api/projects/${project._id}/snapshots/${snapshot._id}/restore`);
    expect(res.status).toBe(200);

    expect(res.body.data.categories).toHaveLength(1);
    expect(res.body.data.categories[0]._id).not.toBe('new-cat-1');
    expect(res.body.data.columns).toHaveLength(1);
    expect(res.body.data.columns[0]._id).not.toBe('new-col-1');
    expect(res.body.data.columns[0].categoryId).toBe(res.body.data.categories[0]._id);

    expect(await Category.countDocuments({ projectId: project._id })).toBe(1);
    expect(await Column.countDocuments({ projectId: project._id })).toBe(1);
  });
});
