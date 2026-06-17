import crypto from 'crypto';

import Category from '../models/Category.js';
import Column from '../models/Column.js';
import CssClass from '../models/CssClass.js';
import Format from '../models/Format.js';
import OperationLog from '../models/OperationLog.js';
import Snapshot from '../models/Snapshot.js';
import { isValidId } from '../utils/validate.js';

import { computeDiff } from './diffService.js';

const MAX_SNAPSHOTS_PER_PROJECT = 5;

const normalizeForHash = (categories, columns) => {
  const categoryIndexById = new Map(categories.map((c, index) => [String(c._id), index]));

  return {
    categories: categories.map((c) => ({ name: c.name, order: c.order })),
    columns: columns.map((c) => ({
      categoryId: c.categoryId != null ? categoryIndexById.get(String(c.categoryId)) ?? null : null,
      key: c.key,
      label: c.label,
      dataType: c.dataType,
      formatId: c.formatId,
      cssClassIds: c.cssClassIds,
      order: c.order,
      required: c.required,
      defaultValue: c.defaultValue,
      validation: c.validation,
    })),
  };
};

const computeHash = (categories, columns) =>
  crypto.createHash('sha256').update(JSON.stringify(normalizeForHash(categories, columns))).digest('hex');

const toDateKey = (date) => date.toISOString().slice(0, 10);

/**
 * 現在のドラフト状態を復元ポイントとして保存する。
 * 既存スナップショットとコンテンツのハッシュ値が一致する場合は上書き更新する。
 * 名前も保存日も変わっていない場合は何もしない（unchanged）。
 * 保存・上限超過による削除・更新は操作ログ（OperationLog）に記録する。
 * @param {string} projectId
 * @param {string} projectName
 * @param {{ categories: object[], columns: object[], name?: string }} draft
 * @returns {Promise<{ snapshot: object, duplicated: boolean, unchanged?: boolean }>}
 */
const saveSnapshot = async(projectId, projectName, { categories, columns, name = '' }) => {
  const hash = computeHash(categories, columns);

  const now = new Date();
  const existing = await Snapshot.findOne({ projectId, hash });

  if (existing) {
    const nameChanged = existing.name !== name;
    const dateChanged = toDateKey(existing.savedAt) !== toDateKey(now);

    if (!nameChanged && !dateChanged) {
      return { snapshot: existing.toObject(), duplicated: true, unchanged: true };
    }

    const fields = [];
    if (dateChanged) { fields.push({ field: 'savedAt', before: existing.savedAt, after: now }); }
    if (nameChanged) { fields.push({ field: 'name', before: existing.name, after: name }); }

    const updated = await Snapshot.findOneAndUpdate(
      { _id: existing._id },
      { savedAt: now, projectName, name },
      { new: true },
    );
    await OperationLog.create({
      projectId,
      operations: [{
        entityType: 'snapshot',
        entityId: String(existing._id),
        action: 'updated',
        label: '復元ポイントを更新しました',
        fields,
      }],
    });
    return { snapshot: updated.toObject(), duplicated: true, unchanged: false };
  }

  const created = await Snapshot.create({ projectId, projectName, name, categories, columns, hash, savedAt: now });

  const operations = [{
    entityType: 'snapshot',
    entityId: String(created._id),
    action: 'created',
    label: '復元ポイントを保存しました',
    fields: [],
  }];

  const total = await Snapshot.countDocuments({ projectId });
  if (total > MAX_SNAPSHOTS_PER_PROJECT) {
    const excess = await Snapshot.find({ projectId })
      .sort({ savedAt: 1, _id: 1 })
      .limit(total - MAX_SNAPSHOTS_PER_PROJECT)
      .select('_id');
    await Snapshot.deleteMany({ _id: { $in: excess.map((s) => s._id) } });
    excess.forEach((s) => {
      operations.push({
        entityType: 'snapshot',
        entityId: String(s._id),
        action: 'deleted',
        label: `保存件数が上限（${MAX_SNAPSHOTS_PER_PROJECT}件）を超えたため、最も古い復元ポイントを削除しました`,
        fields: [],
      });
    });
  }

  await OperationLog.create({ projectId, operations });

  return { snapshot: created, duplicated: false };
};

/**
 * プロジェクトの復元ポイント一覧を保存日時の新しい順で返す。
 * @param {string} projectId
 * @returns {Promise<object[]>}
 */
const listSnapshots = (projectId) =>
  Snapshot.find({ projectId }).sort({ savedAt: -1, _id: -1 }).select('_id savedAt name').lean();

/**
 * 指定した復元ポイントの詳細（保存時点のcategories/columns）を返す。
 * @param {string} projectId
 * @param {string} snapshotId
 * @returns {Promise<object|null>} 復元ポイントが存在しない場合は null
 */
const getSnapshot = (projectId, snapshotId) =>
  Snapshot.findOne({ _id: snapshotId, projectId }).select('_id savedAt name categories columns').lean();

/**
 * 現在のDB状態と指定した復元ポイントを比較し、差分（operations）を返す。
 * before=現在のDB状態、after=復元ポイント時点として computeDiff を呼び出す。
 * @param {string} projectId
 * @param {string} snapshotId
 * @returns {Promise<object[] | null>} 復元ポイントが存在しない場合は null
 */
const getSnapshotDiff = async(projectId, snapshotId) => {
  const snapshot = await Snapshot.findOne({ _id: snapshotId, projectId }).lean();
  if (!snapshot) { return null; }

  const [currentCategories, currentColumns, formats, cssClasses] = await Promise.all([
    Category.find({ projectId }).lean(),
    Column.find({ projectId })
      .populate('formatId', 'value dataType')
      .populate('cssClassIds', 'value description')
      .lean(),
    Format.find().lean(),
    CssClass.find().lean(),
  ]);

  return computeDiff({
    beforeCategories: currentCategories,
    afterCategories: snapshot.categories,
    beforeColumns: currentColumns,
    afterColumns: snapshot.columns,
    formats,
    cssClasses,
  });
};

/**
 * 指定した復元ポイントの categories/columns を DB へ書き戻す。
 * スナップショットは未保存ドラフト（一時ID）の状態でも保存できるため、
 * _id が有効なObjectIdでないカテゴリ・列は新規ドキュメントとして実IDを発行し、
 * 列の categoryId 参照を実IDへ解決してから挿入する。
 * 挿入処理が失敗した場合は削除前のカテゴリ・列を復旧してから例外を再スローする。
 * 復元前後の差分を OperationLog に記録する。
 * @param {string} projectId
 * @param {string} snapshotId
 * @returns {Promise<{ categories: object[], columns: object[] } | null>} 復元ポイントが存在しない場合は null
 */
const restoreSnapshot = async(projectId, snapshotId) => {
  const snapshot = await Snapshot.findOne({ _id: snapshotId, projectId }).lean();
  if (!snapshot) { return null; }

  const [currentCategories, currentColumns, formats, cssClasses] = await Promise.all([
    Category.find({ projectId }).lean(),
    Column.find({ projectId }).lean(),
    Format.find().lean(),
    CssClass.find().lean(),
  ]);

  await Category.deleteMany({ projectId });
  await Column.deleteMany({ projectId });

  let insertedCategories = [];
  let insertedColumns = [];
  try {
    const categoryDocs = snapshot.categories.map((c) => {
      const doc = { projectId, name: c.name, order: c.order ?? 0 };
      if (isValidId(c._id)) { doc._id = c._id; }
      return doc;
    });
    insertedCategories = categoryDocs.length > 0 ? await Category.insertMany(categoryDocs) : [];

    const catIdMap = new Map(snapshot.categories.map((c, i) => [String(c._id), String(insertedCategories[i]._id)]));
    const resolveCategoryId = (categoryId) => (categoryId ? (catIdMap.get(String(categoryId)) || null) : null);

    const columnDocs = snapshot.columns.map((c) => {
      const doc = {
        projectId,
        categoryId: resolveCategoryId(c.categoryId),
        key: c.key, label: c.label,
        dataType: c.dataType || null,
        formatId: c.formatId || null,
        cssClassIds: c.cssClassIds || [],
        order: c.order ?? 0,
        required: !!c.required,
        defaultValue: c.defaultValue ?? null,
        validation: c.validation ?? null,
      };
      if (isValidId(c._id)) { doc._id = c._id; }
      return doc;
    });
    insertedColumns = columnDocs.length > 0 ? await Column.insertMany(columnDocs) : [];
  } catch (err) {
    if (insertedCategories.length > 0) {
      await Category.deleteMany({ _id: { $in: insertedCategories.map((c) => c._id) } });
    }
    if (insertedColumns.length > 0) {
      await Column.deleteMany({ _id: { $in: insertedColumns.map((c) => c._id) } });
    }
    if (currentCategories.length > 0) { await Category.insertMany(currentCategories); }
    if (currentColumns.length > 0) { await Column.insertMany(currentColumns); }
    throw err;
  }

  const [restoredCategories, restoredColumns] = await Promise.all([
    Category.find({ projectId }).lean(),
    Column.find({ projectId })
      .sort({ order: 1 })
      .populate('formatId', 'value dataType')
      .populate('cssClassIds', 'value description')
      .lean(),
  ]);

  const operations = computeDiff({
    beforeCategories: currentCategories,
    afterCategories: restoredCategories,
    beforeColumns: currentColumns,
    afterColumns: restoredColumns,
    formats,
    cssClasses,
  });

  if (operations.length > 0) {
    await OperationLog.create({ projectId, operations });
  }

  return { categories: restoredCategories, columns: restoredColumns };
};

/**
 * 保存前の状態確認（DB変更なし）。
 * 同じハッシュの既存スナップショットがあるか、保存すると上限超過で削除が発生するかを返す。
 * @param {string} projectId
 * @param {{ categories: object[], columns: object[] }} draft
 * @returns {Promise<{ existingSnapshot: object|null, willDelete: boolean, oldestToDelete: object|null }>}
 */
const checkSnapshot = async(projectId, { categories, columns }) => {
  const hash = computeHash(categories, columns);
  const [existing, count] = await Promise.all([
    Snapshot.findOne({ projectId, hash }).select('_id name savedAt').lean(),
    Snapshot.countDocuments({ projectId }),
  ]);
  const willDelete = !existing && count >= MAX_SNAPSHOTS_PER_PROJECT;
  let oldestToDelete = null;
  if (willDelete) {
    oldestToDelete = await Snapshot.findOne({ projectId })
      .sort({ savedAt: 1, _id: 1 })
      .select('_id name savedAt')
      .lean();
  }
  return { existingSnapshot: existing || null, willDelete, oldestToDelete };
};

export { checkSnapshot, getSnapshot, getSnapshotDiff, listSnapshots, restoreSnapshot, saveSnapshot };
