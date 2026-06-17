/**
 * APIへのHTTPリクエストを送信し、{ data, error } 形式のJSONを返す。
 * 非JSONレスポンスやネットワークエラーも同形式に正規化するため、
 * 呼び出し側は常に res.error の有無だけをチェックすればよい。
 * @param {string} method - HTTPメソッド ('GET' | 'POST' | 'PUT' | 'DELETE')
 * @param {string} path - APIエンドポイントのパス
 * @param {Object} [body] - リクエストボディ（省略可）
 * @returns {Promise<{data: *, error: string|null}>}
 */
async function apiFetch(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(path, opts);
    if (!res.headers.get('content-type')?.includes('application/json')) {
      return { data: null, error: `サーバーエラー (HTTP ${res.status})` };
    }
    const json = await res.json();
    if (!res.ok && json.error == null) {
      return { data: null, error: `サーバーエラー (HTTP ${res.status})` };
    }
    return json;
  }
  catch {
    return { data: null, error: 'ネットワークエラーが発生しました' };
  }
}

// Projects
/** プロジェクト一覧を取得する。 */
export const getProjects = () => apiFetch('GET', '/api/projects');

/**
 * 指定IDのプロジェクトを取得する。
 * @param {string} id - プロジェクトID
 */
export const getProject = (id) => apiFetch('GET', `/api/projects/${id}`);

/**
 * プロジェクトを新規作成する。
 * @param {{name: string, description?: string}} data - 作成データ
 */
export const createProject = (data) => apiFetch('POST', '/api/projects', data);

/**
 * プロジェクトを更新する。
 * @param {string} id - プロジェクトID
 * @param {{name?: string, description?: string}} data - 更新データ
 */
export const updateProject = (id, data) => apiFetch('PUT', `/api/projects/${id}`, data);

/**
 * プロジェクトを削除する（配下のカテゴリ・列も全て削除される）。
 * @param {string} id - プロジェクトID
 */
export const deleteProject = (id) => apiFetch('DELETE', `/api/projects/${id}`);

// Categories
/**
 * 指定プロジェクトのカテゴリ一覧を取得する。
 * @param {string} projectId - プロジェクトID
 */
export const getCategories = (projectId) => apiFetch('GET', `/api/projects/${projectId}/categories`);

/**
 * カテゴリを新規作成する。
 * @param {string} projectId - プロジェクトID
 * @param {{name: string, order?: number}} data - 作成データ
 */
export const createCategory = (projectId, data) => apiFetch('POST', `/api/projects/${projectId}/categories`, data);

/**
 * カテゴリを更新する。
 * @param {string} id - カテゴリID
 * @param {{name?: string, order?: number}} data - 更新データ
 */
export const updateCategory = (id, data) => apiFetch('PUT', `/api/categories/${id}`, data);

/**
 * カテゴリを削除する（配下の列も全て削除される）。
 * @param {string} id - カテゴリID
 */
export const deleteCategory = (id) => apiFetch('DELETE', `/api/categories/${id}`);

/**
 * カテゴリの並び順を一括更新する。
 * @param {string} projectId - プロジェクトID
 * @param {string[]} ids - 新しい並び順のカテゴリID配列
 */
export const reorderCategories = (projectId, ids) => apiFetch('POST', `/api/projects/${projectId}/categories/reorder`, { ids });

// Columns
/**
 * 指定プロジェクトの列一覧を取得する。
 * @param {string} projectId - プロジェクトID
 */
export const getColumns = (projectId) => apiFetch('GET', `/api/projects/${projectId}/columns`);

/**
 * 列を新規作成する。
 * @param {string} projectId - プロジェクトID
 * @param {Object} data - 作成データ（key, label, dataType など）
 */
export const createColumn = (projectId, data) => apiFetch('POST', `/api/projects/${projectId}/columns`, data);

/**
 * 列を更新する。
 * @param {string} id - 列ID
 * @param {Object} data - 更新データ
 */
export const updateColumn = (id, data) => apiFetch('PUT', `/api/columns/${id}`, data);

/**
 * 列を削除する。
 * @param {string} id - 列ID
 */
export const deleteColumn = (id) => apiFetch('DELETE', `/api/columns/${id}`);

/**
 * 列の並び順を一括更新する。
 * @param {string} projectId - プロジェクトID
 * @param {string[]} ids - 新しい並び順の列ID配列
 */
export const reorderColumns = (projectId, ids) => apiFetch('POST', `/api/projects/${projectId}/columns/reorder`, { ids });

// Formats
/** フォーマットマスタ一覧を取得する。 */
export const getFormats = () => apiFetch('GET', '/api/formats');

/**
 * フォーマットマスタを新規作成する。
 * @param {{dataType: string, value: string, description?: string, order?: number}} data - 作成データ
 */
export const createFormat = (data) => apiFetch('POST', '/api/formats', data);

/**
 * フォーマットマスタを更新する。
 * @param {string} id - フォーマットID
 * @param {Object} data - 更新データ
 */
export const updateFormat = (id, data) => apiFetch('PUT', `/api/formats/${id}`, data);

/**
 * フォーマットマスタを削除する。
 * @param {string} id - フォーマットID
 */
export const deleteFormat = (id) => apiFetch('DELETE', `/api/formats/${id}`);

// CssClasses
/** CSSクラスマスタ一覧を取得する。 */
export const getCssClasses = () => apiFetch('GET', '/api/css-classes');

/**
 * CSSクラスマスタを新規作成する。
 * @param {{value: string, description?: string, order?: number}} data - 作成データ
 */
export const createCssClass = (data) => apiFetch('POST', '/api/css-classes', data);

/**
 * CSSクラスマスタを更新する。
 * @param {string} id - CSSクラスID
 * @param {Object} data - 更新データ
 */
export const updateCssClass = (id, data) => apiFetch('PUT', `/api/css-classes/${id}`, data);

/**
 * CSSクラスマスタを削除する。
 * @param {string} id - CSSクラスID
 */
export const deleteCssClass = (id) => apiFetch('DELETE', `/api/css-classes/${id}`);

// Export
/**
 * プロジェクトの列定義をエクスポート用JSON形式で取得する。
 * @param {string} id - プロジェクトID
 */
export const exportProject = (id) => apiFetch('GET', `/api/projects/${id}/export`);

// Operation Logs
/**
 * 指定プロジェクトの操作ログ一覧を取得する。
 * @param {string} projectId - プロジェクトID
 */
export const getOperationLogs = (projectId) => apiFetch('GET', `/api/projects/${projectId}/operation-logs`);

// Save
/**
 * カテゴリ・列のドラフト状態を一括保存する。
 * @param {string} projectId - プロジェクトID
 * @param {{categories: object[], columns: object[]}} data - 保存するドラフト状態
 */
export const saveProject = (projectId, data) => apiFetch('POST', `/api/projects/${projectId}/save`, data);

// Snapshots
/**
 * 現在の状態を復元ポイント（スナップショット）として保存する。
 * @param {string} projectId - プロジェクトID
 * @param {{categories: object[], columns: object[]}} data - 保存するドラフト状態
 */
export const saveSnapshot = (projectId, data) => apiFetch('POST', `/api/projects/${projectId}/snapshots`, data);

/**
 * 保存前の状態確認（DB変更なし）。削除発生有無・既存スナップショットの有無を返す。
 * @param {string} projectId - プロジェクトID
 * @param {{categories: object[], columns: object[]}} data - 確認するドラフト状態
 */
export const checkSnapshot = (projectId, data) => apiFetch('POST', `/api/projects/${projectId}/snapshots/check`, data);

/**
 * 指定プロジェクトの復元ポイント一覧を取得する。
 * @param {string} projectId - プロジェクトID
 */
export const getSnapshots = (projectId) => apiFetch('GET', `/api/projects/${projectId}/snapshots`);

/**
 * 指定した復元ポイントの詳細（categories/columns）を取得する。
 * @param {string} projectId - プロジェクトID
 * @param {string} snapshotId - 復元ポイントID
 */
export const getSnapshot = (projectId, snapshotId) => apiFetch('GET', `/api/projects/${projectId}/snapshots/${snapshotId}`);

/**
 * 現在のDB状態と指定した復元ポイントの差分を取得する。
 * @param {string} projectId - プロジェクトID
 * @param {string} snapshotId - 復元ポイントID
 */
export const getSnapshotDiff = (projectId, snapshotId) => apiFetch('GET', `/api/projects/${projectId}/snapshots/${snapshotId}/diff`);

/**
 * 指定した復元ポイントの状態にDBを書き戻す。
 * @param {string} projectId - プロジェクトID
 * @param {string} snapshotId - 復元ポイントID
 */
export const restoreSnapshot = (projectId, snapshotId) => apiFetch('POST', `/api/projects/${projectId}/snapshots/${snapshotId}/restore`);
