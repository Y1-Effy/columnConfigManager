import Project from '../models/Project.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fail } from '../utils/respond.js';
import { isValidId } from '../utils/validate.js';

const resolveProject = asyncHandler(async(req, res, next) => {
  if (!isValidId(req.params.id)) {
    fail(res, 'プロジェクトIDが不正です', 400);
    return;
  }
  const project = await Project.findById(req.params.id);
  if (!project) {
    fail(res, 'プロジェクトが見つかりません', 404);
    return;
  }
  req.project = project;
  next();
});

export default resolveProject;
