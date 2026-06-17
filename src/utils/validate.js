import mongoose from 'mongoose';

/**
 * 文字列がMongoDBのObjectIdとして有効かチェックする。
 * @param {string} id
 * @returns {boolean}
 */
const isValidId = (id) => mongoose.isValidObjectId(id);

export { isValidId };
