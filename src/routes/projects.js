import express from 'express';

import resolveProject from '../middleware/resolveProject.js';
import Project from '../models/Project.js';
import { deleteProject } from '../services/projectService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fail, ok } from '../utils/respond.js';
import { isValidId } from '../utils/validate.js';

const router = express.Router();

/** GET /api/projects — プロジェクト一覧を作成日時の降順で返す */
router.get('/', asyncHandler(async(_req, res) => {
  const projects = await Project.find().sort({ createdAt: -1 });
  return ok(res, projects);
}));

/** POST /api/projects — 新規プロジェクトを作成する */
router.post('/', asyncHandler(async(req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return fail(res, '名前は必須です', 400);
  }
  const project = await Project.create({ name, description });
  return ok(res, project, 201);
}));

/** GET /api/projects/:id — IDでプロジェクトを1件取得する */
router.get('/:id', resolveProject, asyncHandler((req, res) => {
  return ok(res, req.project);
}));

/** PUT /api/projects/:id — プロジェクトの name / description を更新する */
router.put('/:id', asyncHandler(async(req, res) => {
  if (!isValidId(req.params.id)) {
    return fail(res, 'プロジェクトIDが不正です', 400);
  }
  const { name, description } = req.body;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return fail(res, '名前は必須です', 400);
  }
  const project = await Project.findByIdAndUpdate(req.params.id, { name, description }, {
    new: true,
    runValidators: true,
  });
  if (!project) {
    return fail(res, 'プロジェクトが見つかりません', 404);
  }
  return ok(res, project);
}));

/** DELETE /api/projects/:id — プロジェクトと配下のカテゴリ・列を全て削除する（カスケード削除） */
router.delete('/:id', resolveProject, asyncHandler(async(req, res) => {
  await deleteProject(req.params.id);
  return ok(res, null);
}));

export default router;
