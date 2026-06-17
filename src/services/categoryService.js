import Category from '../models/Category.js';

import { reorder } from './reorderService.js';

/**
 * カテゴリの並び順を更新する。
 * @param {string[]} ids - 新しい並び順のカテゴリIDの配列
 * @param {string} projectId - プロジェクトID
 * @returns {Promise<void>}
 */
const reorderCategories = (ids, projectId) => reorder(Category, ids, projectId);

export { reorderCategories };
