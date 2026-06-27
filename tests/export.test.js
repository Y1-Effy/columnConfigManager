import request from 'supertest';

import app from '../server.js';
import Category from '../src/models/Category.js';
import Column from '../src/models/Column.js';
import CssClass from '../src/models/CssClass.js';
import Format from '../src/models/Format.js';

import { FAKE_ID, createProject, setupTestDB } from './mongoHelper.js';

setupTestDB();

describe('Export API', () => {
  let project;

  beforeEach(async() => {
    project = await createProject('Export Test Project');
  });

  describe('GET /api/projects/:id/export', () => {
    it('returns 400 for an invalid project id', async() => {
      const res = await request(app).get('/api/projects/bad-id/export');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('returns 404 for a non-existent project', async() => {
      const res = await request(app).get(`/api/projects/${FAKE_ID}/export`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBeTruthy();
    });

    it('returns correct top-level structure with no columns', async() => {
      const res = await request(app).get(`/api/projects/${project._id}/export`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        projectId: project._id.toString(),
        projectName: 'Export Test Project',
        categories: [],
        uncategorized: [],
      });
      expect(res.body.data.exportedAt).toBeTruthy();
    });

    it('places categorized columns under their category', async() => {
      const cat = await Category.create({ projectId: project._id, name: '基本情報', order: 0 });
      await Column.create({ projectId: project._id, categoryId: cat._id, key: 'name', label: '名前', order: 0 });

      const res = await request(app).get(`/api/projects/${project._id}/export`);
      expect(res.status).toBe(200);

      const { categories, uncategorized } = res.body.data;
      expect(categories).toHaveLength(1);
      expect(categories[0].name).toBe('基本情報');
      expect(categories[0].columns).toHaveLength(1);
      expect(categories[0].columns[0].key).toBe('name');
      expect(uncategorized).toHaveLength(0);
    });

    it('places columns without a category in uncategorized', async() => {
      await Column.create({ projectId: project._id, key: 'status', label: 'ステータス', order: 0 });

      const res = await request(app).get(`/api/projects/${project._id}/export`);
      expect(res.status).toBe(200);

      const { categories, uncategorized } = res.body.data;
      expect(categories).toHaveLength(0);
      expect(uncategorized).toHaveLength(1);
      expect(uncategorized[0].key).toBe('status');
    });

    it('places orphan columns referencing a missing category in uncategorized', async() => {
      // 存在しないカテゴリIDを参照する列（孤立列）はどのカテゴリにも属さないため
      // uncategorized に含めて脱落させない。
      await Column.create({ projectId: project._id, categoryId: FAKE_ID, key: 'orphan', label: '孤立', order: 0 });

      const res = await request(app).get(`/api/projects/${project._id}/export`);
      expect(res.status).toBe(200);

      const { categories, uncategorized } = res.body.data;
      expect(categories).toHaveLength(0);
      expect(uncategorized).toHaveLength(1);
      expect(uncategorized[0].key).toBe('orphan');
    });

    it('includes format value in column entry', async() => {
      const fmt = await Format.create({ dataType: 'Date', value: 'yyyy/MM/dd', order: 0 });
      await Column.create({
        projectId: project._id,
        key: 'orderDate',
        label: '受注日',
        dataType: 'date',
        formatId: fmt._id,
        order: 0,
      });

      const res = await request(app).get(`/api/projects/${project._id}/export`);
      expect(res.status).toBe(200);
      expect(res.body.data.uncategorized[0].format).toBe('yyyy/MM/dd');
    });

    it('includes cssClass values in column entry', async() => {
      const css = await CssClass.create({ value: 'cell-center', order: 0 });
      await Column.create({
        projectId: project._id,
        key: 'amount',
        label: '金額',
        cssClassIds: [css._id],
        order: 0,
      });

      const res = await request(app).get(`/api/projects/${project._id}/export`);
      expect(res.status).toBe(200);
      expect(res.body.data.uncategorized[0].cssClasses).toEqual(['cell-center']);
    });

    it('returns columns sorted by order within each category', async() => {
      const cat = await Category.create({ projectId: project._id, name: 'Cat', order: 0 });
      await Column.create({ projectId: project._id, categoryId: cat._id, key: 'b', label: 'B', order: 2 });
      await Column.create({ projectId: project._id, categoryId: cat._id, key: 'a', label: 'A', order: 1 });

      const res = await request(app).get(`/api/projects/${project._id}/export`);
      expect(res.status).toBe(200);
      const cols = res.body.data.categories[0].columns;
      expect(cols[0].key).toBe('a');
      expect(cols[1].key).toBe('b');
    });

    it('returns categories sorted by order', async() => {
      await Category.create({ projectId: project._id, name: 'Second', order: 2 });
      await Category.create({ projectId: project._id, name: 'First', order: 1 });

      const res = await request(app).get(`/api/projects/${project._id}/export`);
      expect(res.status).toBe(200);
      const cats = res.body.data.categories;
      expect(cats[0].name).toBe('First');
      expect(cats[1].name).toBe('Second');
    });

    it('returns null for format and empty cssClasses when not set', async() => {
      await Column.create({ projectId: project._id, key: 'x', label: 'X', order: 0 });

      const res = await request(app).get(`/api/projects/${project._id}/export`);
      expect(res.status).toBe(200);
      const col = res.body.data.uncategorized[0];
      expect(col.format).toBeNull();
      expect(col.cssClasses).toEqual([]);
      expect(col.required).toBe(false);
      expect(col.defaultValue).toBeNull();
      expect(col.validation).toBeNull();
    });
  });
});
