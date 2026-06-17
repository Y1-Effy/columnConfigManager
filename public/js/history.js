import { getOperationLogs, getProject } from './api.js';
import { ACTION_LABELS, ENTITY_TYPE_LABELS, renderOperationEntry } from './operationDisplay.js';
import { escHtml, formatDate, initModalDelegation, openModal, showToast } from './utils.js';

initModalDelegation();

const params = new URLSearchParams(location.search);
const projectId = params.get('projectId');

if (!projectId) {
  location.href = '/';
}

let logs = [];

/** 概要・詳細で表示する順序（カテゴリ→列、追加→更新→削除）。 */
const SUMMARY_ORDER = [
  'category_created', 'category_updated', 'category_deleted',
  'column_created', 'column_updated', 'column_deleted',
  'snapshot_created', 'snapshot_updated', 'snapshot_deleted',
];

// ---- Load ----

/**
 * プロジェクト情報と操作ログ一覧を並行取得してUIを初期化する。
 * プロジェクトが見つからない場合はトップページにリダイレクトする。
 * @returns {Promise<void>}
 */
async function loadAll() {
  const [projRes, logRes] = await Promise.all([
    getProject(projectId),
    getOperationLogs(projectId),
  ]);
  if (projRes.error) { location.href = '/'; return; }
  document.getElementById('projectLabel').textContent = projRes.data.name;
  document.title = `変更履歴 - ${projRes.data.name}`;
  const editorLink = document.getElementById('editorLink');
  editorLink.href = `/workspace.html?projectId=${projectId}`;
  editorLink.style.pointerEvents = '';
  if (logRes.error) { showToast('履歴の読み込みに失敗しました', 'error'); }
  logs = logRes.data || [];
  renderHistories();
}

// ---- Render table ----

/**
 * 操作ログの operations をエンティティ種別・操作種別ごとに集計し、
 * 「カテゴリ追加1件、列更新2件」のような概要文字列を生成する。
 * @param {Object[]} operations - 操作エントリの配列
 * @returns {string}
 */
function summarizeOperations(operations) {
  const counts = new Map();
  operations.forEach((op) => {
    const key = `${op.entityType}_${op.action}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return SUMMARY_ORDER
    .filter((key) => counts.has(key))
    .map((key) => {
      const [entityType, action] = key.split('_');
      return `${ENTITY_TYPE_LABELS[entityType]}${ACTION_LABELS[action]}${counts.get(key)}件`;
    })
    .join('、');
}

/**
 * logs 配列をもとに変更履歴テーブルを描画する。
 * logs が空の場合は空状態メッセージを表示する。
 */
function renderHistories() {
  const tbody = document.getElementById('historyTbody');
  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted" style="padding:20px;text-align:center;">履歴がありません。エディタで「保存」を実行すると操作ログが記録されます。</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map((log) => `
    <tr>
      <td class="td-nowrap">${escHtml(formatDate(log.createdAt))}</td>
      <td>${escHtml(summarizeOperations(log.operations))}</td>
      <td class="td-actions">
        <button class="btn btn-outline btn-sm" data-detail="${log._id}">詳細</button>
      </td>
    </tr>
  `).join('');
}

// ---- Table event delegation ----
// 「詳細」ボタンがクリックされたら、該当する操作ログの詳細モーダルを開く
document.getElementById('historyTbody').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) { return; }

  if (btn.dataset.detail) {
    const log = logs.find((x) => x._id === btn.dataset.detail);
    if (log) { openDetailModal(log); }
  }
});

// ---- Detail modal ----

/**
 * 操作ログ詳細モーダルを開き、operations を整形表示する。
 * @param {Object} log - 操作ログオブジェクト
 */
function openDetailModal(log) {
  document.getElementById('historyDetailTitle').textContent = `操作ログ詳細 — ${formatDate(log.createdAt)}`;
  document.getElementById('historyDetailBody').innerHTML = log.operations.map(renderOperationEntry).join('');
  openModal('historyDetailModal');
}

// ---- Init ----
loadAll();
