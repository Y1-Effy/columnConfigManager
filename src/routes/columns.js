import express from 'express';

import { FORMAT_DATA_TYPE_BY_COLUMN_TYPE } from '../constants.js';
import resolveProject from '../middleware/resolveProject.js';
import Category from '../models/Category.js';
import Column from '../models/Column.js';
import CssClass from '../models/CssClass.js';
import Format from '../models/Format.js';
import { reorderColumns } from '../services/columnService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fail, ok } from '../utils/respond.js';
import { isValidId } from '../utils/validate.js';

// Mounted at /api/projects/:id/columns
const nestedRouter = express.Router({ mergeParams: true });

/** POST /api/projects/:id/columns/reorder — 列の並び順を更新する */
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
    return fail(res, 'すべてのIDが有効な列IDである必要があります', 400);
  }
  await reorderColumns(ids, req.params.id);
  return ok(res, null);
}));

/** GET /api/projects/:id/columns — プロジェクト配下の列一覧を order 昇順で返す（format/cssClass をpopulate済み） */
nestedRouter.get('/', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.id)) {
    return fail(res, 'プロジェクトIDが不正です', 400);
  }
  const columns = await Column.find({ projectId: req.params.id })
    .sort({ order: 1 })
    .populate('formatId', 'value dataType')
    .populate('cssClassIds', 'value description')
    .lean();
  return ok(res, columns);
}));

/** POST /api/projects/:id/columns — プロジェクト配下に新規列を作成する */
nestedRouter.post('/', resolveProject, asyncHandler(async(req, res) => {
  const { key, label, dataType, formatId, cssClassIds, categoryId, order, required, defaultValue, validation } = req.body;
  if (!key || !label) {
    return fail(res, 'キー名と表示ラベルは必須です', 400);
  }
  if (validation !== undefined && JSON.stringify(validation).length > 1000) {
    return fail(res, 'validationの内容が大きすぎます', 400);
  }
  if (categoryId && !isValidId(categoryId)) { return fail(res, 'カテゴリIDが不正です', 400); }
  if (formatId && !isValidId(formatId)) { return fail(res, 'フォーマットIDが不正です', 400); }

  const uniqueCssClassIds = cssClassIds?.length > 0 ? [...new Set(cssClassIds)] : [];
  const [cat, fmt, cssFound] = await Promise.all([
    categoryId ? Category.findOne({ _id: categoryId, projectId: req.params.id }).lean() : null,
    formatId ? Format.findById(formatId).lean() : null,
    uniqueCssClassIds.length > 0 ? CssClass.countDocuments({ _id: { $in: uniqueCssClassIds } }) : 0,
  ]);
  if (categoryId && !cat) { return fail(res, '指定されたカテゴリがこのプロジェクトに存在しません', 400); }
  if (formatId && !fmt) { return fail(res, '指定されたフォーマットが存在しません', 400); }
  if (formatId && FORMAT_DATA_TYPE_BY_COLUMN_TYPE[dataType] !== fmt.dataType) {
    return fail(res, 'フォーマットのデータ型が列のデータ型と一致しません', 400);
  }
  if (uniqueCssClassIds.length > 0 && cssFound !== uniqueCssClassIds.length) { return fail(res, '存在しないCSSクラスが含まれています', 400); }

  const column = await Column.create({
    projectId: req.params.id,
    categoryId,
    key,
    label,
    dataType,
    formatId,
    cssClassIds,
    order,
    required,
    defaultValue,
    validation,
  });
  return ok(res, column, 201);
}));

// Mounted at /api/columns
const router = express.Router();

/** PUT /api/columns/:columnId — 列の全フィールドを更新する */
router.put('/:columnId', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.columnId)) {
    return fail(res, '列IDが不正です', 400);
  }
  const { key, label, dataType, formatId, cssClassIds, categoryId, order, required, defaultValue, validation } = req.body;
  if (validation !== undefined && JSON.stringify(validation).length > 1000) {
    return fail(res, 'validationの内容が大きすぎます', 400);
  }
  const update = Object.fromEntries(
    Object.entries({ key, label, dataType, formatId, cssClassIds, categoryId, order, required, defaultValue, validation })
      .filter(([, v]) => v !== undefined),
  );
  let existing = null;
  if (update.categoryId || update.formatId || update.dataType !== undefined) {
    existing = await Column.findById(req.params.columnId).lean();
    if (!existing) {
      return fail(res, '列が見つかりません', 404);
    }
  }

  if (update.categoryId) {
    if (!isValidId(update.categoryId)) {
      return fail(res, 'カテゴリIDが不正です', 400);
    }
    const cat = await Category.findOne({ _id: update.categoryId, projectId: existing.projectId }).lean();
    if (!cat) {
      return fail(res, '指定されたカテゴリがこのプロジェクトに存在しません', 400);
    }
  }
  // 有効なformatId（更新値があればそれ、無ければ既存値）を解決し、dataType との整合性を検証する。
  // formatId を変更しなくても dataType だけを互換性のない値へ変更できてしまうのを防ぐ。
  const effectiveFormatId = update.formatId !== undefined ? update.formatId : existing?.formatId;
  if (effectiveFormatId) {
    if (!isValidId(effectiveFormatId)) { return fail(res, 'フォーマットIDが不正です', 400); }
    const fmt = await Format.findById(effectiveFormatId).lean();
    if (!fmt) { return fail(res, '指定されたフォーマットが存在しません', 400); }
    const effectiveDataType = update.dataType !== undefined ? update.dataType : existing?.dataType;
    if (FORMAT_DATA_TYPE_BY_COLUMN_TYPE[effectiveDataType] !== fmt.dataType) {
      return fail(res, 'フォーマットのデータ型が列のデータ型と一致しません', 400);
    }
  }
  if (update.cssClassIds && update.cssClassIds.length > 0) {
    const uniqueCssClassIds = [...new Set(update.cssClassIds)];
    const found = await CssClass.countDocuments({ _id: { $in: uniqueCssClassIds } });
    if (found !== uniqueCssClassIds.length) { return fail(res, '存在しないCSSクラスが含まれています', 400); }
  }
  const column = await Column.findByIdAndUpdate(
    req.params.columnId,
    update,
    { new: true, runValidators: true },
  );
  if (!column) {
    return fail(res, '列が見つかりません', 404);
  }
  return ok(res, column);
}));

/** DELETE /api/columns/:columnId — 列を1件削除する */
router.delete('/:columnId', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.columnId)) {
    return fail(res, '列IDが不正です', 400);
  }
  const column = await Column.findByIdAndDelete(req.params.columnId);
  if (!column) {
    return fail(res, '列が見つかりません', 404);
  }
  return ok(res, null);
}));

export { nestedRouter, router };
