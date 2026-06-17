import { getCssClasses, getFormats, getProject, getSnapshot, getSnapshotDiff, getSnapshots, restoreSnapshot } from './api.js';
import { DATA_TYPES, UI } from './constants.js';
import { FIELD_LABELS, formatFieldValue, renderOperationSummary } from './operationDisplay.js';
import { initResizeHandle, loadPaneWidth } from './paneResize.js';
import { renderPreview } from './preview.js';
import { escHtml, formatDate, getScopedColumns, initModalDelegation, openConfirmModal, showToast, sortByOrder, withLoading } from './utils.js';

initModalDelegation();

const params = new URLSearchParams(location.search);
const projectId = params.get('projectId');

if (!projectId) {
  location.href = '/';
}

let snapshots = [];
let selectedId = null;
let categories = [];
let columns = [];
let formats = [];
let cssClasses = [];
let selectedColumnId = null;

// ---- Pane resize ----

/** ペイン幅をlocalStorageに保存・復元する際のキー。 */
const RESIZE_STORAGE_KEYS = {
  snapshotPane: 'ccm.snapshot.snapshotPaneWidth',
  sidebar: 'ccm.snapshot.sidebarWidth',
  preview: 'ccm.snapshot.previewWidth',
};

/**
 * 保存済みのペイン幅をsnapshot-bodyのCSS変数に適用する。
 */
function restorePaneWidths() {
  const body = document.querySelector('.snapshot-body');
  body.style.setProperty('--snapshot-pane-width', `${loadPaneWidth(RESIZE_STORAGE_KEYS.snapshotPane, UI.SNAPSHOT_PANE_MIN_WIDTH, UI.SNAPSHOT_PANE_MAX_WIDTH, UI.SNAPSHOT_PANE_DEFAULT_WIDTH)}px`);
  body.style.setProperty('--snapshot-sidebar-width', `${loadPaneWidth(RESIZE_STORAGE_KEYS.sidebar, UI.SIDEBAR_MIN_WIDTH, UI.SIDEBAR_MAX_WIDTH, UI.SIDEBAR_DEFAULT_WIDTH)}px`);
  body.style.setProperty('--snapshot-preview-width', `${loadPaneWidth(RESIZE_STORAGE_KEYS.preview, UI.PREVIEW_MIN_WIDTH, UI.PREVIEW_MAX_WIDTH, UI.PREVIEW_DEFAULT_WIDTH)}px`);
}

restorePaneWidths();
const snapshotBody = document.querySelector('.snapshot-body');
initResizeHandle(
  snapshotBody,
  document.getElementById('snapshotPaneResizeHandle'),
  '--snapshot-pane-width', RESIZE_STORAGE_KEYS.snapshotPane,
  UI.SNAPSHOT_PANE_MIN_WIDTH, UI.SNAPSHOT_PANE_MAX_WIDTH,
  (startWidth, deltaX) => startWidth + deltaX,
);
initResizeHandle(
  snapshotBody,
  document.getElementById('snapshotSidebarResizeHandle'),
  '--snapshot-sidebar-width', RESIZE_STORAGE_KEYS.sidebar,
  UI.SIDEBAR_MIN_WIDTH, UI.SIDEBAR_MAX_WIDTH,
  (startWidth, deltaX) => startWidth + deltaX,
);
initResizeHandle(
  snapshotBody,
  document.getElementById('snapshotPreviewResizeHandle'),
  '--snapshot-preview-width', RESIZE_STORAGE_KEYS.preview,
  UI.PREVIEW_MIN_WIDTH, UI.PREVIEW_MAX_WIDTH,
  (startWidth, deltaX) => startWidth - deltaX,
);

// ---- Load ----

/**
 * プロジェクト情報・復元ポイント一覧・マスタデータを並行取得してUIを初期化する。
 * プロジェクトが見つからない場合はトップページにリダイレクトする。
 * @returns {Promise<void>}
 */
async function loadAll() {
  const [projRes, snapRes, fmtRes, cssRes] = await Promise.all([
    getProject(projectId),
    getSnapshots(projectId),
    getFormats(),
    getCssClasses(),
  ]);
  if (projRes.error) { location.href = '/'; return; }
  document.getElementById('projectLabel').textContent = projRes.data.name;
  document.title = `復元ポイント確認 - ${projRes.data.name}`;
  const editorLink = document.getElementById('editorLink');
  editorLink.href = `/workspace.html?projectId=${projectId}`;
  editorLink.style.pointerEvents = '';

  if (fmtRes.error) { showToast('フォーマットマスタの読み込みに失敗しました', 'error'); }
  if (cssRes.error) { showToast('CSSクラスマスタの読み込みに失敗しました', 'error'); }
  formats = fmtRes.data || [];
  cssClasses = cssRes.data || [];

  if (snapRes.error) { showToast('復元ポイント一覧の読み込みに失敗しました', 'error'); }
  snapshots = snapRes.data || [];

  if (snapshots.length === 0) {
    document.getElementById('snapshotEmptyMessage').classList.remove('hidden');
    document.getElementById('snapshotBody').classList.add('hidden');
    return;
  }

  document.getElementById('snapshotEmptyMessage').classList.add('hidden');
  document.getElementById('snapshotBody').classList.remove('hidden');
  renderSnapshotList();
  await selectSnapshot(snapshots[0]._id);
}

// ---- Snapshot list ----

/** 復元ポイント一覧を描画し、選択中の項目をハイライトする。 */
function renderSnapshotList() {
  const list = document.getElementById('snapshotList');
  list.innerHTML = snapshots.map((s) => `
    <div class="snapshot-list-item${s._id === selectedId ? ' selected' : ''}" data-snapshot-id="${s._id}">
      ${s.name ? `<span class="snapshot-name">${escHtml(s.name)}</span>` : ''}
      <span class="snapshot-date">${escHtml(formatDate(s.savedAt))}</span>
    </div>
  `).join('');
}

/**
 * 復元ポイントを選択し、その時点のcategories/columnsでツリー・列定義・プレビューを描画し、
 * 現在のDB状態との差分簡易説明を表示する。
 * @param {string} id - 復元ポイントID
 * @returns {Promise<void>}
 */
async function selectSnapshot(id) {
  selectedId = id;
  renderSnapshotList();

  const [detailRes, diffRes] = await Promise.all([
    getSnapshot(projectId, id),
    getSnapshotDiff(projectId, id),
  ]);

  if (detailRes.error) {
    showToast('復元ポイントの読み込みに失敗しました', 'error');
    return;
  }

  categories = sortByOrder(detailRes.data.categories || []);
  columns = (detailRes.data.columns || []).map((c) => ({
    ...c,
    formatId: c.formatId ? (formats.find((f) => f._id === c.formatId) || null) : null,
    cssClassIds: cssClasses.filter((cc) => (c.cssClassIds || []).includes(cc._id)),
  }));

  if (selectedColumnId && !columns.some((c) => c._id === selectedColumnId)) {
    selectedColumnId = null;
  }

  renderColumnTree();
  renderPreview(categories, columns, '列がありません。');
  if (selectedColumnId) {
    selectColumn(selectedColumnId);
  } else {
    showPlaceholder();
  }

  document.getElementById('btnRestore').disabled = false;

  if (diffRes.error) {
    showToast('差分の取得に失敗しました', 'error');
    return;
  }
  renderDiffSummary(diffRes.data.operations || []);
}

// ---- Column tree (read-only) ----

/** カテゴリ・列のツリーをサイドバーに描画する（読み取り専用）。 */
function renderColumnTree() {
  const scroll = document.getElementById('sidebarScroll');
  scroll.innerHTML = '';

  const uncategorized = getScopedColumns(columns, null);

  sortByOrder(categories).forEach((cat) => {
    scroll.appendChild(buildCategoryBlock(cat, getScopedColumns(columns, cat._id)));
  });

  if (uncategorized.length > 0) {
    scroll.appendChild(buildUncategorizedBlock(uncategorized));
  }
}

/**
 * カテゴリブロック（見出し行＋列リスト）のDOM要素を生成する。
 * @param {Object} cat - カテゴリ
 * @param {Object[]} catCols - このカテゴリに属する列の配列
 * @returns {HTMLElement}
 */
function buildCategoryBlock(cat, catCols) {
  const block = document.createElement('div');
  block.className = 'category-block';

  const row = document.createElement('div');
  row.className = 'category-row';
  row.innerHTML = `<span class="category-name truncate" title="${escHtml(cat.name)}">${escHtml(cat.name)}</span>`;
  block.appendChild(row);

  catCols.forEach((col) => {
    block.appendChild(buildColumnItem(col));
  });

  return block;
}

/**
 * 未分類列ブロックのDOM要素を生成する。
 * @param {Object[]} cols - 未分類列の配列
 * @returns {HTMLElement}
 */
function buildUncategorizedBlock(cols) {
  const block = document.createElement('div');
  block.className = 'category-block';

  const row = document.createElement('div');
  row.className = 'category-row';
  row.innerHTML = '<span class="category-name">（未分類）</span>';
  block.appendChild(row);

  cols.forEach((col) => {
    block.appendChild(buildColumnItem(col));
  });

  return block;
}

/**
 * サイドバーの列アイテムのDOM要素を生成する（読み取り専用、クリックで列定義を表示）。
 * @param {Object} col - 列
 * @returns {HTMLElement}
 */
function buildColumnItem(col) {
  const item = document.createElement('div');
  item.className = `column-item${col._id === selectedColumnId ? ' selected' : ''}`;
  item.dataset.colId = col._id;

  item.innerHTML = `
    <span class="col-label truncate" title="${escHtml(col.label)}">${escHtml(col.label)}</span>
    <span class="col-key truncate" title="${escHtml(col.key)}">${escHtml(col.key)}</span>
  `;

  item.addEventListener('click', () => selectColumn(col._id));

  return item;
}

// ---- Column detail (read-only) ----

/**
 * 列が選択されていない状態のプレースホルダを表示する。
 */
function showPlaceholder() {
  selectedColumnId = null;
  document.querySelectorAll('.column-item').forEach((el) => el.classList.remove('selected'));
  document.getElementById('columnDetail').classList.add('hidden');
  document.getElementById('editorPlaceholder').classList.remove('hidden');
  document.getElementById('formTitle').textContent = '列定義';
}

/**
 * 列を選択状態にし、読み取り専用の列定義を表示する。
 * @param {string} id - 選択する列ID
 */
function selectColumn(id) {
  const col = columns.find((c) => c._id === id);
  if (!col) { showPlaceholder(); return; }

  selectedColumnId = id;
  document.querySelectorAll('.column-item').forEach((el) => {
    el.classList.toggle('selected', el.dataset.colId === id);
  });

  document.getElementById('editorPlaceholder').classList.add('hidden');
  const detail = document.getElementById('columnDetail');
  detail.innerHTML = renderColumnDetail(col);
  detail.classList.remove('hidden');
  document.getElementById('formTitle').textContent = `${col.label}（${col.key}）`;
}

/**
 * 列定義の各フィールドを <dt>/<dd> の並びに変換する。
 * フォーマットは dataType が date/number の場合のみ表示し、
 * validationは値があればJSON整形して<pre>表示する。
 * @param {Object} col - 列
 * @returns {string}
 */
function renderColumnDetail(col) {
  const rows = [];
  const addRow = (field, val) => {
    rows.push(`<dt>${escHtml(FIELD_LABELS[field])}</dt><dd>${escHtml(formatFieldValue(field, val))}</dd>`);
  };

  addRow('key', col.key);
  addRow('label', col.label);
  addRow('dataType', col.dataType);
  if (col.dataType === DATA_TYPES.DATE || col.dataType === DATA_TYPES.NUMBER) {
    addRow('formatId', col.formatId);
  }
  addRow('cssClassIds', col.cssClassIds);
  addRow('required', col.required);
  addRow('defaultValue', col.defaultValue);

  if (col.validation) {
    rows.push(`<dt>${escHtml(FIELD_LABELS.validation)}</dt><dd><pre>${escHtml(JSON.stringify(col.validation, null, 2))}</pre></dd>`);
  } else {
    addRow('validation', col.validation);
  }

  return rows.join('');
}

// ---- Diff summary ----

/**
 * 現在のDB状態とこの復元ポイントの差分を簡易リストとして表示する。
 * @param {Object[]} operations - 操作エントリの配列
 */
function renderDiffSummary(operations) {
  const list = document.getElementById('snapshotSummaryList');
  if (operations.length === 0) {
    list.innerHTML = '<li class="text-muted">現在の内容との差分はありません。</li>';
    return;
  }
  list.innerHTML = operations.map(renderOperationSummary).join('');
}

// ---- List event delegation ----
// 復元ポイント一覧の項目がクリックされたら、選択を切り替えて表示内容を再取得する
document.getElementById('snapshotList').addEventListener('click', (e) => {
  const item = e.target.closest('[data-snapshot-id]');
  if (!item || item.dataset.snapshotId === selectedId) { return; }
  selectSnapshot(item.dataset.snapshotId);
});

// ---- Restore ----
document.getElementById('btnRestore').addEventListener('click', (e) => {
  if (!selectedId) { return; }
  const snap = snapshots.find((s) => s._id === selectedId);
  const label = snap
    ? (snap.name ? `${snap.name}（${formatDate(snap.savedAt)}）` : formatDate(snap.savedAt))
    : '選択中の復元ポイント';
  const btn = e.currentTarget;
  openConfirmModal(`「${label}」の状態に復元しますか？現在のDB内容は上書きされます。`, async() => {
    await withLoading(btn, async() => {
      const res = await restoreSnapshot(projectId, selectedId);
      if (res.error) { showToast(res.error, 'error'); return; }
      showToast('復元ポイントに復元しました');
      const diffRes = await getSnapshotDiff(projectId, selectedId);
      if (!diffRes.error) {
        renderDiffSummary(diffRes.data.operations || []);
      }
    });
  }, '復元する', 'btn-primary');
});

// ---- Init ----
loadAll();
