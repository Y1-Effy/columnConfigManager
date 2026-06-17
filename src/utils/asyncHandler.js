/**
 * 非同期ルートハンドラをラップし、Promiseの拒否をExpressのエラーハンドラ（next）に転送する。
 * これにより各ルートで try/catch を省略できる。
 * @param {Function} fn - 非同期ルートハンドラ
 * @returns {Function} (req, res, next) => void
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
