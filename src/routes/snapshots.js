import express from 'express';

import resolveProject from '../middleware/resolveProject.js';
import { checkSnapshot, getSnapshot, getSnapshotDiff, listSnapshots, restoreSnapshot, saveSnapshot } from '../services/snapshotService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fail, ok } from '../utils/respond.js';
import { isValidId } from '../utils/validate.js';

// Mounted at /api/projects/:id/snapshots
const router = express.Router({ mergeParams: true });

/** GET /api/projects/:id/snapshots — 復元ポイント一覧を保存日時の新しい順で返す */
router.get('/', resolveProject, asyncHandler(async(req, res) => {
  const snapshots = await listSnapshots(req.params.id);
  return ok(res, snapshots);
}));

/** POST /api/projects/:id/snapshots/check — 保存前の状態確認（DB変更なし） */
router.post('/check', resolveProject, asyncHandler(async(req, res) => {
  const { categories, columns } = req.body;
  if (!Array.isArray(categories) || !Array.isArray(columns)) {
    return fail(res, 'categories/columnsは配列で指定してください', 400);
  }
  const result = await checkSnapshot(req.params.id, { categories, columns });
  return ok(res, result);
}));

/** POST /api/projects/:id/snapshots — 現在のドラフト状態を復元ポイントとして保存する */
router.post('/', resolveProject, asyncHandler(async(req, res) => {
  const { categories, columns, name } = req.body;
  if (!Array.isArray(categories) || !Array.isArray(columns)) {
    return fail(res, 'categories/columnsは配列で指定してください', 400);
  }

  const { snapshot, duplicated, unchanged } = await saveSnapshot(req.params.id, req.project.name, { categories, columns, name });
  return ok(res, { snapshot, duplicated, unchanged }, duplicated ? 200 : 201);
}));

/** GET /api/projects/:id/snapshots/:snapshotId — 復元ポイントの詳細（categories/columns）を返す */
router.get('/:snapshotId', resolveProject, asyncHandler(async(req, res) => {
  if (!isValidId(req.params.snapshotId)) {
    return fail(res, '復元ポイントIDが不正です', 400);
  }

  const snapshot = await getSnapshot(req.params.id, req.params.snapshotId);
  if (!snapshot) {
    return fail(res, '指定された復元ポイントが見つかりません', 404);
  }

  return ok(res, snapshot);
}));

/** GET /api/projects/:id/snapshots/:snapshotId/diff — 現在のDB状態と復元ポイントの差分を返す */
router.get('/:snapshotId/diff', resolveProject, asyncHandler(async(req, res) => {
  if (!isValidId(req.params.snapshotId)) {
    return fail(res, '復元ポイントIDが不正です', 400);
  }

  const operations = await getSnapshotDiff(req.params.id, req.params.snapshotId);
  if (!operations) {
    return fail(res, '指定された復元ポイントが見つかりません', 404);
  }

  return ok(res, { operations });
}));

/** POST /api/projects/:id/snapshots/:snapshotId/restore — 指定した復元ポイントの状態に戻す */
router.post('/:snapshotId/restore', resolveProject, asyncHandler(async(req, res) => {
  if (!isValidId(req.params.snapshotId)) {
    return fail(res, '復元ポイントIDが不正です', 400);
  }

  const result = await restoreSnapshot(req.params.id, req.params.snapshotId);
  if (!result) {
    return fail(res, '指定された復元ポイントが見つかりません', 404);
  }

  return ok(res, result);
}));

export default router;
