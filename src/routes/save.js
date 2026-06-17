import express from 'express';

import resolveProject from '../middleware/resolveProject.js';
import { saveProjectState } from '../services/saveService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fail, ok } from '../utils/respond.js';

// Mounted at /api/projects/:id/save
const router = express.Router({ mergeParams: true });

/** POST /api/projects/:id/save — カテゴリ・列のドラフト状態を一括保存し、差分を操作ログに記録する */
router.post('/', resolveProject, asyncHandler(async(req, res) => {
  const { categories, columns } = req.body;
  if (!Array.isArray(categories) || !Array.isArray(columns)) {
    return fail(res, 'categories/columnsは配列で指定してください', 400);
  }
  if (categories.length > 200) {
    return fail(res, 'カテゴリの件数が上限（200件）を超えています', 400);
  }
  if (columns.length > 500) {
    return fail(res, '列の件数が上限（500件）を超えています', 400);
  }

  const result = await saveProjectState(req.params.id, { categories, columns });
  if (result.error) {
    return fail(res, result.error, 400);
  }
  return ok(res, result.data);
}));

export default router;
