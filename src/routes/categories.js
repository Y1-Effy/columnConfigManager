import express from 'express';

import resolveProject from '../middleware/resolveProject.js';
import Category from '../models/Category.js';
import Column from '../models/Column.js';
import { reorderCategories } from '../services/categoryService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fail, ok } from '../utils/respond.js';
import { isValidId } from '../utils/validate.js';

// Mounted at /api/projects/:id/categories
const nestedRouter = express.Router({ mergeParams: true });

/** POST /api/projects/:id/categories/reorder — カテゴリの並び順を更新する */
nestedRouter.post('/reorder', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.id)) {
    return fail(res, 'プロジェクトIDが不正です', 400);
  }
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return fail(res, 'IDは配列で指定してください', 400);
  }
  if (ids.length > 200) {
    return fail(res, 'IDの件数が上限（200件）を超えています', 400);
  }
  if (!ids.every((id) => isValidId(id))) {
    return fail(res, 'すべてのIDが有効なカテゴリIDである必要があります', 400);
  }
  await reorderCategories(ids, req.params.id);
  return ok(res, null);
}));

/** GET /api/projects/:id/categories — プロジェクト配下のカテゴリ一覧を order 昇順で返す */
nestedRouter.get('/', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.id)) {
    return fail(res, 'プロジェクトIDが不正です', 400);
  }
  const categories = await Category.find({ projectId: req.params.id }).sort({ order: 1 }).lean();
  return ok(res, categories);
}));

/** POST /api/projects/:id/categories — プロジェクト配下に新規カテゴリを作成する */
nestedRouter.post('/', resolveProject, asyncHandler(async(req, res) => {
  const { name, order } = req.body;
  if (!name) {
    return fail(res, '名前は必須です', 400);
  }
  const category = await Category.create({ projectId: req.params.id, name, order });
  return ok(res, category, 201);
}));

// Mounted at /api/categories
const router = express.Router();

/** PUT /api/categories/:categoryId — カテゴリ名・並び順を更新する */
router.put('/:categoryId', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.categoryId)) {
    return fail(res, 'カテゴリIDが不正です', 400);
  }
  const { name, order } = req.body;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return fail(res, '名前は必須です', 400);
  }
  const category = await Category.findByIdAndUpdate(
    req.params.categoryId,
    { name, order },
    { new: true, runValidators: true },
  );
  if (!category) {
    return fail(res, 'カテゴリが見つかりません', 404);
  }
  return ok(res, category);
}));

/** DELETE /api/categories/:categoryId — カテゴリとその配下の列を全て削除する（カスケード削除） */
router.delete('/:categoryId', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.categoryId)) {
    return fail(res, 'カテゴリIDが不正です', 400);
  }
  const category = await Category.findByIdAndDelete(req.params.categoryId);
  if (!category) {
    return fail(res, 'カテゴリが見つかりません', 404);
  }
  await Column.deleteMany({ categoryId: req.params.categoryId });
  return ok(res, null);
}));

export { nestedRouter, router };
