import Category from '../models/Category.js';
import Column from '../models/Column.js';
import OperationLog from '../models/OperationLog.js';
import Project from '../models/Project.js';
import Snapshot from '../models/Snapshot.js';

/**
 * プロジェクトと配下のカテゴリ・列・操作ログを全て削除する（カスケード削除）。
 * 関連データを先に削除してから本体を削除する。
 * @param {string} projectId
 * @returns {Promise<void>}
 */
const deleteProject = async(projectId) => {
  await Promise.all([
    Category.deleteMany({ projectId }),
    Column.deleteMany({ projectId }),
    OperationLog.deleteMany({ projectId }),
    Snapshot.deleteMany({ projectId }),
  ]);
  await Project.findByIdAndDelete(projectId);
};

export { deleteProject };
