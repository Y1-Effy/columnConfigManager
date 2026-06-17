import Column from '../models/Column.js';

import { reorder } from './reorderService.js';

/**
 * 列の並び順を更新する。
 * @param {string[]} ids - 新しい並び順の列IDの配列
 * @param {string} projectId - プロジェクトID
 * @returns {Promise<void>}
 */
const reorderColumns = (ids, projectId) => reorder(Column, ids, projectId);

export { reorderColumns };
