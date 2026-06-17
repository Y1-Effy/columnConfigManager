import { FORMAT_DATA_TYPE_BY_COLUMN_TYPE } from '../constants.js';
import Category from '../models/Category.js';
import Column from '../models/Column.js';
import CssClass from '../models/CssClass.js';
import Format from '../models/Format.js';
import OperationLog from '../models/OperationLog.js';
import { isValidId } from '../utils/validate.js';

import { computeDiff } from './diffService.js';

const VALIDATION_MAX_LENGTH = 1000;

const formatValidationError = (err) => Object.values(err.errors).map((e) => e.message).join('、');

const trimString = (val) => (typeof val === 'string' ? val.trim() : val);

const buildCategoryFields = (draft) => ({
  name: trimString(draft.name),
  order: draft.order ?? 0,
});

const buildColumnFields = (draft, resolveCategoryId) => ({
  categoryId: resolveCategoryId(draft.categoryId),
  key: trimString(draft.key),
  label: trimString(draft.label),
  dataType: draft.dataType || null,
  formatId: draft.formatId || null,
  cssClassIds: draft.cssClassIds || [],
  order: draft.order ?? 0,
  required: !!draft.required,
  defaultValue: draft.defaultValue ?? null,
  validation: draft.validation ?? null,
});

/**
 * カテゴリ・列のドラフト状態をDBへ一括反映し、保存前後の差分を操作ログとして記録する。
 * @param {string} projectId
 * @param {{ categories: object[], columns: object[] }} draft - クライアントのドラフト状態
 * @returns {Promise<{ error: string } | { data: object }>}
 */
const saveProjectState = async(projectId, { categories: draftCategories, columns: draftColumns }) => {
  if (
    !draftCategories.every((c) => typeof c._id === 'string' && c._id) ||
    !draftColumns.every((c) => typeof c._id === 'string' && c._id)
  ) {
    return { error: 'カテゴリ・列のIDが不正です' };
  }

  // --- 現状取得 ---
  const [dbCategories, dbColumns, formats, cssClasses] = await Promise.all([
    Category.find({ projectId }).lean(),
    Column.find({ projectId }).lean(),
    Format.find().lean(),
    CssClass.find().lean(),
  ]);

  const dbCategoryIds = new Set(dbCategories.map((c) => String(c._id)));
  const dbColumnIds = new Set(dbColumns.map((c) => String(c._id)));
  const isExistingCategory = (draft) => isValidId(draft._id) && dbCategoryIds.has(draft._id);
  const isExistingColumn = (draft) => isValidId(draft._id) && dbColumnIds.has(draft._id);

  // --- 検証（DB書き込み前） ---
  const draftCategoryIds = new Set(draftCategories.map((c) => c._id));
  const formatIds = new Set(formats.map((f) => String(f._id)));
  const cssClassIdSet = new Set(cssClasses.map((c) => String(c._id)));

  for (const draft of draftCategories) {
    const err = new Category({ projectId, ...buildCategoryFields(draft) }).validateSync();
    if (err) { return { error: formatValidationError(err) }; }
  }

  for (const draft of draftColumns) {
    if (draft.categoryId && !draftCategoryIds.has(draft.categoryId)) {
      return { error: '指定されたカテゴリが見つかりません' };
    }
    if (draft.formatId && !isValidId(draft.formatId)) {
      return { error: 'フォーマットIDが不正です' };
    }
    if (draft.formatId && !formatIds.has(draft.formatId)) {
      return { error: '指定されたフォーマットが存在しません' };
    }
    if (draft.formatId) {
      const fmt = formats.find((f) => String(f._id) === draft.formatId);
      if (FORMAT_DATA_TYPE_BY_COLUMN_TYPE[draft.dataType] !== fmt.dataType) {
        return { error: 'フォーマットのデータ型が列のデータ型と一致しません' };
      }
    }
    if (draft.cssClassIds?.some((id) => !isValidId(id))) {
      return { error: 'CSSクラスIDが不正です' };
    }
    if (draft.cssClassIds?.some((id) => !cssClassIdSet.has(id))) {
      return { error: '存在しないCSSクラスが含まれています' };
    }
    if (draft.validation !== undefined && draft.validation !== null && JSON.stringify(draft.validation).length > VALIDATION_MAX_LENGTH) {
      return { error: 'validationの内容が大きすぎます' };
    }

    const err = new Column({
      projectId,
      key: trimString(draft.key),
      label: trimString(draft.label),
      dataType: draft.dataType || undefined,
      formatId: draft.formatId || undefined,
      cssClassIds: draft.cssClassIds || [],
      order: draft.order ?? 0,
      required: !!draft.required,
      defaultValue: draft.defaultValue ?? null,
      validation: draft.validation ?? null,
    }).validateSync();
    if (err) { return { error: formatValidationError(err) }; }
  }

  const draftKeys = draftColumns.map((c) => trimString(c.key)).filter(Boolean);
  if (new Set(draftKeys).size !== draftKeys.length) {
    return { error: 'プロジェクト内でキー名が重複しています' };
  }

  // --- DB反映 ---
  const newCategoryDrafts = draftCategories.filter((c) => !isExistingCategory(c));
  const existingCategoryDrafts = draftCategories.filter((c) => isExistingCategory(c));
  const newColumnDrafts = draftColumns.filter((c) => !isExistingColumn(c));
  const existingColumnDrafts = draftColumns.filter((c) => isExistingColumn(c));

  const insertedCategories = newCategoryDrafts.length > 0
    ? await Category.insertMany(newCategoryDrafts.map((c) => ({ projectId, ...buildCategoryFields(c) })))
    : [];
  const catIdMap = new Map(newCategoryDrafts.map((c, i) => [c._id, String(insertedCategories[i]._id)]));
  const resolveCategoryId = (categoryId) => (categoryId ? (catIdMap.get(categoryId) || categoryId) : null);

  let insertedColumns = [];
  try {
    insertedColumns = newColumnDrafts.length > 0
      ? await Column.insertMany(newColumnDrafts.map((c) => ({ projectId, ...buildColumnFields(c, resolveCategoryId) })))
      : [];

    if (existingCategoryDrafts.length > 0) {
      await Category.bulkWrite(existingCategoryDrafts.map((c) => ({
        updateOne: { filter: { _id: c._id }, update: { $set: buildCategoryFields(c) } },
      })));
    }

    if (existingColumnDrafts.length > 0) {
      await Column.bulkWrite(existingColumnDrafts.map((c) => ({
        updateOne: { filter: { _id: c._id }, update: { $set: buildColumnFields(c, resolveCategoryId) } },
      })));
    }

    const keepCategoryIds = new Set(existingCategoryDrafts.map((c) => c._id));
    const removedCategoryIds = dbCategories.filter((c) => !keepCategoryIds.has(String(c._id))).map((c) => c._id);
    if (removedCategoryIds.length > 0) {
      await Category.deleteMany({ _id: { $in: removedCategoryIds } });
    }

    const keepColumnIds = new Set(existingColumnDrafts.map((c) => c._id));
    const removedColumnIds = dbColumns.filter((c) => !keepColumnIds.has(String(c._id))).map((c) => c._id);
    if (removedColumnIds.length > 0) {
      await Column.deleteMany({ _id: { $in: removedColumnIds } });
    }
  } catch (err) {
    if (insertedCategories.length > 0) {
      await Category.deleteMany({ _id: { $in: insertedCategories.map((c) => c._id) } });
    }
    if (insertedColumns.length > 0) {
      await Column.deleteMany({ _id: { $in: insertedColumns.map((c) => c._id) } });
    }
    throw err;
  }

  // --- 保存後の最終状態を取得し、差分を計算 ---
  const [finalCategories, finalColumns] = await Promise.all([
    Category.find({ projectId }).lean(),
    Column.find({ projectId })
      .sort({ order: 1 })
      .populate('formatId', 'value dataType')
      .populate('cssClassIds', 'value description')
      .lean(),
  ]);

  const operations = computeDiff({
    beforeCategories: dbCategories,
    afterCategories: finalCategories,
    beforeColumns: dbColumns,
    afterColumns: finalColumns,
    formats,
    cssClasses,
  });

  const operationLog = operations.length > 0 ? await OperationLog.create({ projectId, operations }) : null;

  // --- レスポンス構築（リクエストと同じ順序で返す） ---
  const finalCategoryMap = new Map(finalCategories.map((c) => [String(c._id), c]));
  const finalColumnMap = new Map(finalColumns.map((c) => [String(c._id), c]));
  const colIdMap = new Map(newColumnDrafts.map((c, i) => [c._id, String(insertedColumns[i]._id)]));

  const responseCategories = draftCategories.map((draft) => {
    const realId = isExistingCategory(draft) ? draft._id : catIdMap.get(draft._id);
    return finalCategoryMap.get(realId);
  });

  const responseColumns = draftColumns.map((draft) => {
    const realId = isExistingColumn(draft) ? draft._id : colIdMap.get(draft._id);
    return finalColumnMap.get(realId);
  });

  return {
    data: {
      categories: responseCategories,
      columns: responseColumns,
      operationLog,
    },
  };
};

export { saveProjectState };
