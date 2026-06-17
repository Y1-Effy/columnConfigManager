/**
 * 指定IDの順序でドキュメントの order フィールドを bulkWrite で一括更新する。
 * projectId をフィルタに含めることで、他プロジェクトのドキュメントを誤って変更しない。
 * @param {import('mongoose').Model} Model - 更新対象のMongooseモデル
 * @param {string[]} ids - 新しい並び順のID配列（配列のインデックスが order 値になる）
 * @param {string} projectId - プロジェクトID（スコープ制限に使用）
 * @returns {Promise<void>}
 */
const reorder = async(Model, ids, projectId) => {
  const ops = ids.map((id, index) => ({
    updateOne: {
      filter: { _id: id, projectId },
      update: { $set: { order: index } },
    },
  }));
  if (ops.length > 0) {
    await Model.bulkWrite(ops);
  }
};

export { reorder };
