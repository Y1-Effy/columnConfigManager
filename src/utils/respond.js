/**
 * 成功レスポンスを { data, error: null } 形式で返す。
 * 全APIレスポンスはこの形式に統一されているため、
 * クライアントは常に res.error の有無だけをチェックすればよい。
 * @param {import('express').Response} res
 * @param {*} data - レスポンスデータ
 * @param {number} [status=200] - HTTPステータスコード
 * @returns {import('express').Response}
 */
const ok = (res, data, status = 200) => {
  return res.status(status).json({ data, error: null });
};

/**
 * エラーレスポンスを { data: null, error: message } 形式で返す。
 * @param {import('express').Response} res
 * @param {string} message - エラーメッセージ
 * @param {number} [status=400] - HTTPステータスコード
 * @returns {import('express').Response}
 */
const fail = (res, message, status = 400) => {
  return res.status(status).json({ data: null, error: message });
};

export { fail, ok };
