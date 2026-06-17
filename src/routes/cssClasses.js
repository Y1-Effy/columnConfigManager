import express from 'express';

import Column from '../models/Column.js';
import CssClass from '../models/CssClass.js';
import asyncHandler from '../utils/asyncHandler.js';
import { checkDuplicate } from '../utils/checkDuplicate.js';
import { fail, ok } from '../utils/respond.js';
import { isValidId } from '../utils/validate.js';

const router = express.Router();

/** GET /api/css-classes — CSSクラスマスタ一覧を order 昇順で返す */
router.get('/', asyncHandler(async(_req, res) => {
  const cssClasses = await CssClass.find().sort({ order: 1, createdAt: 1 }).lean();
  return ok(res, cssClasses);
}));

/** POST /api/css-classes — 新規CSSクラスを作成する */
router.post('/', asyncHandler(async(req, res) => {
  const { value, description, order } = req.body;
  if (!value) {
    return fail(res, '値は必須です', 400);
  }
  const existing = await checkDuplicate(CssClass, { value });
  if (existing) {
    return fail(res, 'このクラス名はすでに存在します', 409);
  }
  const cssClass = await CssClass.create({ value, description, order });
  return ok(res, cssClass, 201);
}));

/** PUT /api/css-classes/:id — CSSクラスを更新する */
router.put('/:id', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.id)) {
    return fail(res, 'CSSクラスIDが不正です', 400);
  }
  const { value, description, order } = req.body;
  if (value !== undefined) {
    const conflict = await checkDuplicate(CssClass, { value }, req.params.id);
    if (conflict) {
      return fail(res, 'このクラス名はすでに存在します', 409);
    }
  }
  const cssClass = await CssClass.findByIdAndUpdate(
    req.params.id,
    { value, description, order },
    { new: true, runValidators: true },
  );
  if (!cssClass) {
    return fail(res, 'CSSクラスが見つかりません', 404);
  }
  return ok(res, cssClass);
}));

/** DELETE /api/css-classes/:id — CSSクラスを削除する */
router.delete('/:id', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.id)) {
    return fail(res, 'CSSクラスIDが不正です', 400);
  }
  const usedBy = await Column.findOne({ cssClassIds: req.params.id }).lean();
  if (usedBy) {
    return fail(res, 'このCSSクラスは列で使用中のため削除できません', 400);
  }
  const cssClass = await CssClass.findByIdAndDelete(req.params.id);
  if (!cssClass) {
    return fail(res, 'CSSクラスが見つかりません', 404);
  }
  return ok(res, null);
}));

export default router;
