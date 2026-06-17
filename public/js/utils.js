import { LOCALE } from './constants.js';

/**
 * HTML特殊文字をエスケープしてXSSを防ぐ。
 * テンプレートリテラルにユーザー入力を埋め込む際は必ずこの関数を使用する。
 * @param {*} str - エスケープする値（文字列に変換される）
 * @returns {string} エスケープ済みHTML文字列
 */
export function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * ISO日付文字列を日本語ロケールの "YYYY/MM/DD HH:MM" 形式に変換する。
 * @param {string} iso - ISO 8601形式の日付文字列
 * @returns {string} フォーマット済みの日付文字列
 */
export function formatDate(iso) {
  return new Date(iso).toLocaleString(LOCALE, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * 画面右下にトーストメッセージを表示する。成功は3秒、エラーは5秒で自動消去。
 * @param {string} msg - 表示するメッセージ
 * @param {'success'|'error'} [type='success'] - トーストの種類（CSSクラスに使用）
 */
export function showToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 3000);
}

/**
 * MongoDB の populate 済みオブジェクトまたは生 ID 文字列から ID 文字列を返す。
 * API レスポンスで参照フィールドがオブジェクトと文字列の両方になりうる場合に使用する。
 * @param {Object|string|null|undefined} val
 * @returns {string|null}
 */
export function resolveId(val) {
  if (!val) { return null; }
  return typeof val === 'object' ? val._id : val;
}

/** モーダルを表示する。 */
export function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

/** モーダルを非表示にする。 */
export function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

/**
 * data-modal-close 属性を持つボタンのクリックで対応するモーダルを閉じる
 * デリゲートリスナーをページに1つ登録する。
 */
export function initModalDelegation() {
  // data-modal-close属性を持つ要素がクリックされたら、対応するモーダルを閉じる
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-modal-close]');
    if (btn) { closeModal(btn.dataset.modalClose); }
  });
  // 確認モーダルの「OK」ボタンがクリックされたら、登録済みのコールバックを実行してモーダルを閉じる
  document.getElementById('confirmOk')?.addEventListener('click', handleConfirmOk);
}

let _confirmCallback = null;

/** 汎用確認モーダルを開く。onConfirm は確認ボタン押下時に呼び出される。confirmVariant は確認ボタンの配色クラス（btn-danger / btn-primary 等）。 */
export function openConfirmModal(message, onConfirm, confirmLabel = '削除する', confirmVariant = 'btn-danger') {
  document.getElementById('confirmMessage').textContent = message;
  const confirmOk = document.getElementById('confirmOk');
  confirmOk.textContent = confirmLabel;
  confirmOk.className = `btn ${confirmVariant}`;
  _confirmCallback = onConfirm;
  openModal('confirmModal');
}

/** confirmModal の「削除する」ボタンから呼び出す。 */
export function handleConfirmOk() {
  if (!_confirmCallback) { return; }
  const cb = _confirmCallback;
  _confirmCallback = null;
  closeModal('confirmModal');
  cb();
}

/** btn を disabled にして asyncFn を実行し、完了後に再有効化する。 */
export async function withLoading(btn, asyncFn) {
  btn.disabled = true;
  try {
    await asyncFn();
  } finally {
    btn.disabled = false;
  }
}

/** fn を ms ミリ秒デバウンスした関数を返す。 */
export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/**
 * order プロパティの昇順でソートした新しい配列を返す。
 * @param {Object[]} arr - categories または columns の配列
 * @returns {Object[]} ソート済みの新しい配列
 */
export function sortByOrder(arr) {
  return [...arr].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * 指定カテゴリに属する列を order 順に返す。
 * catId が null の場合は未分類列（categoryId が未設定の列）を返す。
 * @param {Object[]} columns - 列の配列
 * @param {string|null} catId - カテゴリID（未分類はnull）
 * @returns {Object[]} 絞り込み・ソート済みの列の配列
 */
export function getScopedColumns(columns, catId) {
  if (!catId) {
    return sortByOrder(columns.filter((c) => !c.categoryId));
  }
  return sortByOrder(columns.filter((c) => c.categoryId === catId));
}
