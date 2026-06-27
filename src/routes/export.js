import express from 'express';

import resolveProject from '../middleware/resolveProject.js';
import Category from '../models/Category.js';
import Column from '../models/Column.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';

const router = express.Router({ mergeParams: true });

/** GET /api/projects/:id/export — プロジェクト構成をカテゴリ・列ごとにJSONエクスポートする */
router.get('/', resolveProject, asyncHandler(async(req, res) => {
  const [categories, columns] = await Promise.all([
    Category.find({ projectId: req.params.id }).sort({ order: 1 }).lean(),
    Column.find({ projectId: req.params.id })
      .sort({ order: 1 })
      .populate('formatId', 'value dataType')
      .populate('cssClassIds', 'value')
      .lean(),
  ]);

  /**
   * MongooseのColumnドキュメントをエクスポート用のフラットなオブジェクトに変換する。
   * populate済みの formatId / cssClassIds を値（文字列）に展開する。
   * @param {Object} col - populate済みColumnドキュメント
   * @returns {{ key, label, dataType, format, cssClasses, required, defaultValue, validation }}
   */
  const toColumnEntry = (col) => ({
    key: col.key,
    label: col.label,
    dataType: col.dataType || null,
    format: col.formatId ? col.formatId.value : null,
    cssClasses: (col.cssClassIds || []).map((c) => c.value),
    required: col.required,
    defaultValue: col.defaultValue ?? null,
    validation: col.validation || null,
  });

  const columnsByCategory = new Map();
  for (const col of columns) {
    const key = col.categoryId ? String(col.categoryId) : null;
    if (!columnsByCategory.has(key)) { columnsByCategory.set(key, []); }
    columnsByCategory.get(key).push(col);
  }

  const categoryIdSet = new Set(categories.map((cat) => String(cat._id)));
  const categoriesOutput = categories.map((cat) => ({
    id: cat._id.toString(),
    name: cat.name,
    columns: (columnsByCategory.get(String(cat._id)) ?? []).map(toColumnEntry),
  }));

  // カテゴリ未設定（null）の列に加え、存在しないカテゴリを参照する孤立列も未分類として出力する
  // （いずれかのカテゴリ出力に含まれない列が脱落しないようにする）。
  const uncategorized = [];
  for (const [key, cols] of columnsByCategory) {
    if (key === null || !categoryIdSet.has(key)) {
      uncategorized.push(...cols);
    }
  }
  const uncategorizedOutput = uncategorized.map(toColumnEntry);

  return ok(res, {
    projectId: req.project._id.toString(),
    projectName: req.project.name,
    exportedAt: new Date().toISOString(),
    categories: categoriesOutput,
    uncategorized: uncategorizedOutput,
  });
}));

export default router;
