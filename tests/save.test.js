import request from 'supertest';

import app from '../server.js';
import Category from '../src/models/Category.js';
import Column from '../src/models/Column.js';
import CssClass from '../src/models/CssClass.js';
import Format from '../src/models/Format.js';
import OperationLog from '../src/models/OperationLog.js';

import { FAKE_ID, createProject, setupTestDB } from './mongoHelper.js';

setupTestDB();

describe('POST /api/projects/:id/save', () => {
  let project;

  beforeEach(async() => {
    project = await createProject();
  });

  it('returns 400 for an invalid project id', async() => {
    const res = await request(app).post('/api/projects/bad-id/save').send({ categories: [], columns: [] });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent project', async() => {
    const res = await request(app).post(`/api/projects/${FAKE_ID}/save`).send({ categories: [], columns: [] });
    expect(res.status).toBe(404);
  });

  it('returns 400 when categories/columns are not arrays', async() => {
    const res = await request(app).post(`/api/projects/${project._id}/save`).send({ categories: {}, columns: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the column count exceeds the limit', async() => {
    const columns = Array.from({ length: 501 }, (_, i) => ({ _id: `new-${i}`, key: `k${i}`, label: `L${i}`, order: i }));
    const res = await request(app).post(`/api/projects/${project._id}/save`).send({ categories: [], columns });
    expect(res.status).toBe(400);
  });

  it('creates new categories and columns, mapping temp ids to real ids in response order', async() => {
    const res = await request(app)
      .post(`/api/projects/${project._id}/save`)
      .send({
        categories: [{ _id: 'new-cat-1', name: '基本情報', order: 0 }],
        columns: [{ _id: 'new-col-1', categoryId: 'new-cat-1', key: 'name', label: '名前', order: 0 }],
      });

    expect(res.status).toBe(200);
    const { categories, columns, operationLog } = res.body.data;
    expect(categories).toHaveLength(1);
    expect(columns).toHaveLength(1);
    expect(categories[0]._id).not.toBe('new-cat-1');
    expect(columns[0]._id).not.toBe('new-col-1');
    expect(columns[0].categoryId).toBe(categories[0]._id);

    expect(await Category.countDocuments({ projectId: project._id })).toBe(1);
    expect(await Column.countDocuments({ projectId: project._id })).toBe(1);

    expect(operationLog).not.toBeNull();
    expect(operationLog.operations.some((op) => op.entityType === 'category' && op.action === 'created')).toBe(true);
    expect(operationLog.operations.some((op) => op.entityType === 'column' && op.action === 'created')).toBe(true);
  });

  it('updates existing categories and columns and records field diffs', async() => {
    const category = await Category.create({ projectId: project._id, name: 'Old Cat', order: 0 });
    const column = await Column.create({ projectId: project._id, categoryId: category._id, key: 'price', label: 'Old Label', order: 0 });

    const res = await request(app)
      .post(`/api/projects/${project._id}/save`)
      .send({
        categories: [{ _id: String(category._id), name: 'New Cat', order: 0 }],
        columns: [{ _id: String(column._id), categoryId: String(category._id), key: 'price', label: 'New Label', order: 0 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.categories[0].name).toBe('New Cat');
    expect(res.body.data.columns[0].label).toBe('New Label');

    const { operationLog } = res.body.data;
    const colOp = operationLog.operations.find((op) => op.entityType === 'column');
    expect(colOp.action).toBe('updated');
    expect(colOp.fields).toEqual(expect.arrayContaining([
      { field: 'label', before: 'Old Label', after: 'New Label' },
    ]));
  });

  it('deletes categories and columns that are missing from the draft', async() => {
    const category = await Category.create({ projectId: project._id, name: 'Cat', order: 0 });
    const column = await Column.create({ projectId: project._id, categoryId: category._id, key: 'k', label: 'K', order: 0 });

    const res = await request(app)
      .post(`/api/projects/${project._id}/save`)
      .send({ categories: [], columns: [] });

    expect(res.status).toBe(200);
    expect(await Category.findById(category._id)).toBeNull();
    expect(await Column.findById(column._id)).toBeNull();

    const { operationLog } = res.body.data;
    expect(operationLog.operations.some((op) => op.entityType === 'category' && op.action === 'deleted')).toBe(true);
    expect(operationLog.operations.some((op) => op.entityType === 'column' && op.action === 'deleted')).toBe(true);
  });

  it('returns 400 and makes no DB changes when a column label is missing', async() => {
    const res = await request(app)
      .post(`/api/projects/${project._id}/save`)
      .send({
        categories: [],
        columns: [{ _id: 'new-col-1', key: 'name', label: '', order: 0 }],
      });

    expect(res.status).toBe(400);
    expect(await Column.countDocuments({ projectId: project._id })).toBe(0);
  });

  it('returns 400 when a column references a non-existent format', async() => {
    const res = await request(app)
      .post(`/api/projects/${project._id}/save`)
      .send({
        categories: [],
        columns: [{ _id: 'new-col-1', key: 'name', label: '名前', order: 0, formatId: FAKE_ID }],
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a column references a non-existent css class', async() => {
    const res = await request(app)
      .post(`/api/projects/${project._id}/save`)
      .send({
        categories: [],
        columns: [{ _id: 'new-col-1', key: 'name', label: '名前', order: 0, cssClassIds: [FAKE_ID] }],
      });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a column references a category not present in the draft', async() => {
    const res = await request(app)
      .post(`/api/projects/${project._id}/save`)
      .send({
        categories: [],
        columns: [{ _id: 'new-col-1', categoryId: FAKE_ID, key: 'name', label: '名前', order: 0 }],
      });
    expect(res.status).toBe(400);
  });

  it('resolves formatId/cssClassIds to master values in the response', async() => {
    const format = await Format.create({ dataType: 'Number', value: '¥#,##0' });
    const cssClass = await CssClass.create({ value: 'text-right' });

    const res = await request(app)
      .post(`/api/projects/${project._id}/save`)
      .send({
        categories: [],
        columns: [{
          _id: 'new-col-1', key: 'amount', label: '金額', dataType: 'number', order: 0,
          formatId: String(format._id), cssClassIds: [String(cssClass._id)],
        }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.columns[0].formatId._id).toBe(String(format._id));
    expect(res.body.data.columns[0].cssClassIds[0]._id).toBe(String(cssClass._id));
  });

  it('returns 400 when a column\'s formatId data type does not match its own dataType', async() => {
    const format = await Format.create({ dataType: 'Date', value: 'yyyy/MM/dd' });

    const res = await request(app)
      .post(`/api/projects/${project._id}/save`)
      .send({
        categories: [],
        columns: [{
          _id: 'new-col-1', key: 'amount', label: '金額', dataType: 'number', order: 0,
          formatId: String(format._id),
        }],
      });

    expect(res.status).toBe(400);
    expect(await Column.countDocuments({ projectId: project._id })).toBe(0);
  });

  it('does not create an operation log when nothing changed', async() => {
    const category = await Category.create({ projectId: project._id, name: 'Cat', order: 0 });
    const column = await Column.create({ projectId: project._id, categoryId: category._id, key: 'k', label: 'K', order: 0 });

    const res = await request(app)
      .post(`/api/projects/${project._id}/save`)
      .send({
        categories: [{ _id: String(category._id), name: 'Cat', order: 0 }],
        columns: [{ _id: String(column._id), categoryId: String(category._id), key: 'k', label: 'K', order: 0 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.operationLog).toBeNull();
    expect(await OperationLog.countDocuments({ projectId: project._id })).toBe(0);
  });
});
