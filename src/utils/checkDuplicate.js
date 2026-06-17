/**
 * 指定フィルタで重複ドキュメントを検索する。
 * excludeId を指定した場合は自身を除外して検索する（更新時の重複チェックに使用）。
 * @param {import('mongoose').Model} Model
 * @param {object} filter - 重複チェックの条件
 * @param {string|null} [excludeId=null] - 除外するドキュメントのID
 * @returns {Promise<object|null>} 重複ドキュメント、なければ null
 */
const checkDuplicate = (Model, filter, excludeId = null) => {
  const query = excludeId ? { ...filter, _id: { $ne: excludeId } } : filter;
  return Model.findOne(query).lean();
};

export { checkDuplicate };
