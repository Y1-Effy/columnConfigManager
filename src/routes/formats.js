import express from 'express';

import Column from '../models/Column.js';
import Format from '../models/Format.js';
import asyncHandler from '../utils/asyncHandler.js';
import { checkDuplicate } from '../utils/checkDuplicate.js';
import { fail, ok } from '../utils/respond.js';
import { isValidId } from '../utils/validate.js';

const router = express.Router();

/** GET /api/formats — フォーマットマスタ一覧を order 昇順で返す */
router.get('/', asyncHandler(async(_req, res) => {
  const formats = await Format.find().sort({ order: 1, createdAt: 1 }).lean();
  return ok(res, formats);
}));

/** POST /api/formats — 新規フォーマットを作成する */
router.post('/', asyncHandler(async(req, res) => {
  const { dataType, value, description, order } = req.body;
  if (!dataType || !value) {
    return fail(res, 'データ型と値は必須です', 400);
  }
  const existing = await checkDuplicate(Format, { dataType, value });
  if (existing) {
    return fail(res, 'このデータ型と値の組み合わせはすでに存在します', 409);
  }
  const format = await Format.create({ dataType, value, description, order });
  return ok(res, format, 201);
}));

/** PUT /api/formats/:id — フォーマットを更新する */
router.put('/:id', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.id)) {
    return fail(res, 'フォーマットIDが不正です', 400);
  }
  const { dataType, value, description, order } = req.body;
  if (dataType !== undefined && value !== undefined) {
    const conflict = await checkDuplicate(Format, { dataType, value }, req.params.id);
    if (conflict) {
      return fail(res, 'このデータ型と値の組み合わせはすでに存在します', 409);
    }
  }
  const format = await Format.findByIdAndUpdate(
    req.params.id,
    { dataType, value, description, order },
    { new: true, runValidators: true },
  );
  if (!format) {
    return fail(res, 'フォーマットが見つかりません', 404);
  }
  return ok(res, format);
}));

/** DELETE /api/formats/:id — フォーマットを削除する */
router.delete('/:id', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.id)) {
    return fail(res, 'フォーマットIDが不正です', 400);
  }
  const usedBy = await Column.findOne({ formatId: req.params.id }).lean();
  if (usedBy) {
    return fail(res, 'このフォーマットは列で使用中のため削除できません', 400);
  }
  const format = await Format.findByIdAndDelete(req.params.id);
  if (!format) {
    return fail(res, 'フォーマットが見つかりません', 404);
  }
  return ok(res, null);
}));

export default router;
