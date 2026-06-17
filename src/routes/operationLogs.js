import express from 'express';

import resolveProject from '../middleware/resolveProject.js';
import OperationLog from '../models/OperationLog.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';

// Mounted at /api/projects/:id/operation-logs
const router = express.Router({ mergeParams: true });

/** GET /api/projects/:id/operation-logs — 操作ログ一覧を新しい順で返す */
router.get('/', resolveProject, asyncHandler(async(req, res) => {
  const logs = await OperationLog.find({ projectId: req.params.id }).sort({ createdAt: -1, _id: -1 }).lean();
  return ok(res, logs);
}));

export default router;
