import {
  checkSnapshot, exportProject, getCategories, getColumns, getCssClasses, getFormats, getProject, saveProject, saveSnapshot,
} from './api.js';
import { DATA_TYPES, UI } from './constants.js';
import { initResizeHandle, loadPaneWidth } from './paneResize.js';
import { renderPreview } from './preview.js';
import { closeModal, debounce, escHtml, formatDate, getScopedColumns, initModalDelegation, openConfirmModal, openModal, resolveId, showToast, sortByOrder, withLoading } from './utils.js';

initModalDelegation();

const params = new URLSearchParams(location.search);
const projectId = params.get('projectId');

if (!projectId) {
  location.href = '/';
}

let categories = [];
let columns = [];
let formats = [];
let cssClasses = [];
let selectedColumnId = null;
let hasUnsavedChanges = false;

/** クライアント側で新規追加した要素に割り当てる一時的なIDを生成する。 */
const makeTempId = () => `new-${crypto.randomUUID()}`;

/**
 * デフォルト値の入力文字列を列のデータ型に応じた型へ変換する。
 * 変換できない場合は入力文字列のまま返す。
 * @param {string} raw - トリム済みの入力文字列
 * @param {string} dataType - 列のデータ型
 * @returns {string|number|boolean|null}
 */
function coerceDefaultValue(raw, dataType) {
  if (!raw) { return null; }
  if (dataType === DATA_TYPES.NUMBER) {
    const num = Number(raw);
    return isNaN(num) ? raw : num;
  }
  if (dataType === DATA_TYPES.BOOLEAN) {
    if (raw === 'true') { return true; }
    if (raw === 'false') { return false; }
    return raw;
  }
  return raw;
}

/** ドラフトに未保存の変更があることを記録する。 */
function markDirty() {
  hasUnsavedChanges = true;
}

/** ドラフトを変更済みにし、サイドバーとプレビューを再描画する。 */
function applyChange() {
  markDirty();
  renderSidebar();
  renderPreview(categories, columns);
}

// 未保存の変更がある状態でページを離脱しようとしたら、ブラウザの確認ダイアログを表示する
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---- Pane resize ----

/** ペイン幅をlocalStorageに保存・復元する際のキー。 */
const RESIZE_STORAGE_KEYS = {
  sidebar: 'ccm.workspace.sidebarWidth',
  preview: 'ccm.workspace.previewWidth',
};

/**
 * 保存済みのペイン幅をworkspace-bodyのCSS変数に適用する。
 */
function restorePaneWidths() {
  const body = document.querySelector('.workspace-body');
  body.style.setProperty('--sidebar-width', `${loadPaneWidth(RESIZE_STORAGE_KEYS.sidebar, UI.SIDEBAR_MIN_WIDTH, UI.SIDEBAR_MAX_WIDTH, UI.SIDEBAR_DEFAULT_WIDTH)}px`);
  body.style.setProperty('--preview-width', `${loadPaneWidth(RESIZE_STORAGE_KEYS.preview, UI.PREVIEW_MIN_WIDTH, UI.PREVIEW_MAX_WIDTH, UI.PREVIEW_DEFAULT_WIDTH)}px`);
}

restorePaneWidths();
const workspaceBody = document.querySelector('.workspace-body');
initResizeHandle(
  workspaceBody,
  document.getElementById('sidebarResizeHandle'),
  '--sidebar-width', RESIZE_STORAGE_KEYS.sidebar,
  UI.SIDEBAR_MIN_WIDTH, UI.SIDEBAR_MAX_WIDTH,
  (startWidth, deltaX) => startWidth + deltaX,
);
initResizeHandle(
  workspaceBody,
  document.getElementById('previewResizeHandle'),
  '--preview-width', RESIZE_STORAGE_KEYS.preview,
  UI.PREVIEW_MIN_WIDTH, UI.PREVIEW_MAX_WIDTH,
  (startWidth, deltaX) => startWidth - deltaX,
);

// ---- Load all data ----

/**
 * プロジェクト・カテゴリ・列・マスタデータを並行取得してUIを初期化する。
 * @returns {Promise<void>}
 */
async function loadAll() {
  const [projRes, catRes, colRes, fmtRes, cssRes] = await Promise.all([
    getProject(projectId),
    getCategories(projectId),
    getColumns(projectId),
    getFormats(),
    getCssClasses(),
  ]);

  if (projRes.error) { location.href = '/'; return; }
  document.getElementById('projectLabel').textContent = projRes.data.name;
  document.title = `${projRes.data.name} - Column Config Manager`;

  if (catRes.error || colRes.error) {
    showToast('カテゴリ・列データの読み込みに失敗しました', 'error');
  }
  if (fmtRes.error) { showToast('フォーマットマスタの読み込みに失敗しました', 'error'); }
  if (cssRes.error) { showToast('CSSクラスマスタの読み込みに失敗しました', 'error'); }
  categories = catRes.data || [];
  columns = (colRes.data || []).map((col) => ({ ...col, categoryId: resolveId(col.categoryId) }));
  formats = fmtRes.data || [];
  cssClasses = cssRes.data || [];

  renderSidebar();
  populateMasterSelects();
  renderPreview(categories, columns);
}

// ---- Sidebar rendering ----

/**
 * カテゴリ・列のツリーをサイドバーに描画する。
 * カテゴリも列もない場合は空状態メッセージを表示する。
 */
function renderSidebar() {
  const scroll = document.getElementById('sidebarScroll');
  const empty = document.getElementById('sidebarEmpty');

  scroll.innerHTML = '';

  const uncategorized = getScopedColumns(columns, null);
  const allEmpty = categories.length === 0 && uncategorized.length === 0;

  if (allEmpty) {
    empty.textContent = 'カテゴリ・列がありません。＋カテゴリから追加してください。';
    scroll.appendChild(empty);
    return;
  }

  sortByOrder(categories).forEach((cat, catIdx) => {
    scroll.appendChild(buildCategoryBlock(cat, catIdx, getScopedColumns(columns, cat._id)));
  });

  if (uncategorized.length > 0) {
    scroll.appendChild(buildUncategorizedBlock(uncategorized));
  }
}

/**
 * カテゴリブロック（見出し行＋列追加ボタン＋列リスト）のDOM要素を生成する。
 * 先頭・末尾のカテゴリには移動ボタンの一方を非表示にする。
 * @param {Object} cat - カテゴリドキュメント
 * @param {number} catIdx - カテゴリの現在インデックス
 * @param {Object[]} catCols - このカテゴリに属する列の配列
 * @returns {HTMLElement}
 */
function buildCategoryBlock(cat, catIdx, catCols) {
  const block = document.createElement('div');
  block.className = 'category-block';

  const row = document.createElement('div');
  row.className = 'category-row';
  row.innerHTML = `
    <span class="category-name truncate" title="${escHtml(cat.name)}">${escHtml(cat.name)}</span>
    <div class="actions">
      ${catIdx > 0 ? `<button class="icon-btn" data-cat-up="${cat._id}" title="上へ" aria-label="カテゴリを上へ移動">▲</button>` : ''}
      ${catIdx < categories.length - 1 ? `<button class="icon-btn" data-cat-down="${cat._id}" title="下へ" aria-label="カテゴリを下へ移動">▼</button>` : ''}
      <button class="icon-btn" data-cat-edit="${cat._id}" title="編集" aria-label="カテゴリを編集">✏️</button>
      <button class="icon-btn danger" data-cat-del="${cat._id}" title="削除" aria-label="カテゴリを削除">×</button>
    </div>
  `;
  block.appendChild(row);

  const addRow = document.createElement('div');
  addRow.className = 'add-column-row';
  addRow.innerHTML = `<button class="btn btn-outline btn-sm" data-add-col-cat="${cat._id}">＋列を追加</button>`;
  block.appendChild(addRow);

  catCols.forEach((col, colIdx) => {
    block.appendChild(buildColumnItem(col, colIdx, catCols.length, cat._id));
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

  const addRow = document.createElement('div');
  addRow.className = 'add-column-row';
  addRow.innerHTML = '<button class="btn btn-outline btn-sm" data-add-col-cat="">＋列を追加</button>';
  block.appendChild(addRow);

  cols.forEach((col, colIdx) => {
    block.appendChild(buildColumnItem(col, colIdx, cols.length, null));
  });

  return block;
}

/**
 * サイドバーの列アイテムのDOM要素を生成する。
 * 選択中の列には selected クラスを付与する。
 * @param {Object} col - 列ドキュメント
 * @param {number} colIdx - カテゴリ内での列インデックス
 * @param {number} total - カテゴリ内の列総数
 * @param {string|null} catId - 親カテゴリID（未分類の場合はnull）
 * @returns {HTMLElement}
 */
function buildColumnItem(col, colIdx, total, catId) {
  const item = document.createElement('div');
  item.className = `column-item${col._id === selectedColumnId ? ' selected' : ''}`;
  item.dataset.colId = col._id;

  item.innerHTML = `
    <span class="col-label truncate" title="${escHtml(col.label)}">${escHtml(col.label)}</span>
    <span class="col-key truncate" title="${escHtml(col.key)}">${escHtml(col.key)}</span>
    <div class="actions">
      ${colIdx > 0 ? `<button class="icon-btn" data-col-up="${col._id}" data-cat="${catId || ''}" title="上へ" aria-label="列を上へ移動">▲</button>` : ''}
      ${colIdx < total - 1 ? `<button class="icon-btn" data-col-down="${col._id}" data-cat="${catId || ''}" title="下へ" aria-label="列を下へ移動">▼</button>` : ''}
      <button class="icon-btn danger" data-col-del="${col._id}" title="削除" aria-label="列を削除">×</button>
    </div>
  `;

  // 列アイテムがクリックされたら（移動・削除ボタン以外）、その列を選択状態にする
  item.addEventListener('click', (e) => {
    if (e.target.closest('[data-col-up],[data-col-down],[data-col-del]')) { return; }
    selectColumn(col._id);
  });

  return item;
}

// ---- Sidebar event delegation ----
// サイドバーのツリー内の各ボタン（並び替え・編集・削除・列追加）がクリックされたら、対応する操作を行う
document.getElementById('sidebarScroll').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) { return; }

  // Category up
  if (btn.dataset.catUp) {
    reorderLocal(sortByOrder(categories), btn.dataset.catUp, -1);
    applyChange();
    return;
  }
  // Category down
  if (btn.dataset.catDown) {
    reorderLocal(sortByOrder(categories), btn.dataset.catDown, +1);
    applyChange();
    return;
  }
  // Category edit
  if (btn.dataset.catEdit) {
    openCategoryModal(btn.dataset.catEdit);
    return;
  }
  // Category delete
  if (btn.dataset.catDel) {
    const catToDelete = categories.find((c) => c._id === btn.dataset.catDel);
    const catName = catToDelete ? `「${catToDelete.name}」` : '';
    const catDelId = btn.dataset.catDel;
    openConfirmModal(`カテゴリ${catName}とその列を全て削除しますか？`, () => {
      categories = categories.filter((c) => c._id !== catDelId);
      if (selectedColumnId) {
        const col = columns.find((c) => c._id === selectedColumnId);
        if (col?.categoryId === catDelId) {
          selectedColumnId = null;
          showPlaceholder();
        }
      }
      columns = columns.filter((c) => c.categoryId !== catDelId);
      applyChange();
    });
    return;
  }
  // Column up
  if (btn.dataset.colUp) {
    reorderLocal(getScopedColumns(columns, btn.dataset.cat || null), btn.dataset.colUp, -1);
    applyChange();
    return;
  }
  // Column down
  if (btn.dataset.colDown) {
    reorderLocal(getScopedColumns(columns, btn.dataset.cat || null), btn.dataset.colDown, +1);
    applyChange();
    return;
  }
  // Column delete
  if (btn.dataset.colDel) {
    const colToDelete = columns.find((c) => c._id === btn.dataset.colDel);
    const colName = colToDelete ? `「${colToDelete.label}」` : '';
    const colDelId = btn.dataset.colDel;
    openConfirmModal(`列${colName}を削除しますか？`, () => {
      columns = columns.filter((c) => c._id !== colDelId);
      if (selectedColumnId === colDelId) {
        selectedColumnId = null;
        showPlaceholder();
      }
      applyChange();
    });
    return;
  }
  // Add column
  if (btn.dataset.addColCat !== undefined) {
    openAddColumnModal(btn.dataset.addColCat);
    return;
  }
});

// ---- Reorder helpers ----

/**
 * arr 内の id を持つ要素を delta（-1 or +1）方向に隣接要素と入れ替え、order を振り直す。
 * @param {Object[]} arr - 操作対象の配列（要素はcategories/columnsと共有される参照）
 * @param {string} id - 移動対象のID
 * @param {number} delta - 移動方向（-1: 上、+1: 下）
 */
function reorderLocal(arr, id, delta) {
  const idx = arr.findIndex((x) => x._id === id);
  const target = idx + delta;
  if (idx < 0 || target < 0 || target >= arr.length) { return; }
  [arr[idx], arr[target]] = [arr[target], arr[idx]];
  arr.forEach((item, i) => { item.order = i; });
}

// ---- Add category modal ----
// 「＋カテゴリ」ボタンがクリックされたら、カテゴリ追加モーダルを開く
document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal(null));

/**
 * カテゴリ追加・編集モーダルを開く。idが指定された場合は編集モードになる。
 * @param {string|null} id - 編集するカテゴリID（新規追加の場合はnull）
 */
function openCategoryModal(id) {
  const title = document.getElementById('categoryModalTitle');
  const input = document.getElementById('categoryModalName');
  const hidden = document.getElementById('categoryModalId');

  if (id) {
    const cat = categories.find((c) => c._id === id);
    title.textContent = 'カテゴリ編集';
    input.value = cat ? cat.name : '';
    hidden.value = id;
  } else {
    title.textContent = 'カテゴリ追加';
    input.value = '';
    hidden.value = '';
  }
  openModal('addCategoryModal');
  input.focus();
}

// カテゴリモーダルの「保存」ボタンがクリックされたら、カテゴリ名を検証してドラフトに追加・更新し、サイドバーを再描画する
document.getElementById('categoryModalSave').addEventListener('click', () => {
  const name = document.getElementById('categoryModalName').value.trim();
  if (!name) { showToast('カテゴリ名は必須です', 'error'); return; }
  const id = document.getElementById('categoryModalId').value;
  if (id) {
    const cat = categories.find((c) => c._id === id);
    if (cat) { cat.name = name; }
  } else {
    const order = categories.length === 0 ? 0 : Math.max(...categories.map((c) => c.order)) + 1;
    categories.push({ _id: makeTempId(), projectId, name, order });
  }
  markDirty();
  closeModal('addCategoryModal');
  renderSidebar();
});

// ---- Add column modal ----

/**
 * 列追加モーダルを開き、フォームを初期化する。
 * @param {string} catId - 新規列を追加するカテゴリID（未分類の場合は空文字）
 */
function openAddColumnModal(catId) {
  document.getElementById('columnModalCategoryId').value = catId || '';
  document.getElementById('columnModalKey').value = '';
  document.getElementById('columnModalLabel').value = '';
  openModal('addColumnModal');
  document.getElementById('columnModalKey').focus();
}

// 列追加モーダルの「保存」ボタンがクリックされたら、キー名・表示ラベルを検証して新しい列をドラフトに追加し、選択状態にする
document.getElementById('columnModalSave').addEventListener('click', () => {
  const key = document.getElementById('columnModalKey').value.trim();
  const label = document.getElementById('columnModalLabel').value.trim();
  if (!key || !label) { showToast('キー名と表示ラベルは必須です', 'error'); return; }
  if (columns.some((c) => c.key === key)) { showToast('このキー名はすでに使用されています', 'error'); return; }
  const categoryId = document.getElementById('columnModalCategoryId').value || null;
  const scoped = getScopedColumns(columns, categoryId);
  const order = scoped.length === 0 ? 0 : Math.max(...scoped.map((c) => c.order)) + 1;
  const newColumn = {
    _id: makeTempId(),
    projectId,
    categoryId,
    key,
    label,
    order,
    dataType: null,
    formatId: null,
    cssClassIds: [],
    required: false,
    defaultValue: null,
    validation: null,
  };
  columns.push(newColumn);
  markDirty();
  closeModal('addColumnModal');
  renderSidebar();
  selectColumn(newColumn._id);
});

// ---- Column form ----

/**
 * フォーマット・CSSクラスのセレクトUI全体を初期化する。
 * 列選択前の初期状態（選択なし）で呼び出す。
 */
function populateMasterSelects() {
  populateFormatSelect();
  populateCssClassChecks();
}

/**
 * フォーマット選択プルダウンを生成する。
 * フォーマットは date / number データ型の列にのみ適用できるため、
 * dataType が指定された場合はその型に一致するものだけを表示する。
 * @param {string} [selectedId] - 選択状態にするフォーマットID
 * @param {string} [dataType] - フィルタするデータ型 ('date' | 'number')
 */
function populateFormatSelect(selectedId, dataType) {
  const sel = document.getElementById('fFormat');
  sel.innerHTML = '<option value="">（なし）</option>';
  const filtered = (dataType === DATA_TYPES.DATE || dataType === DATA_TYPES.NUMBER)
    ? formats.filter((f) => f.dataType.toLowerCase() === dataType)
    : [];
  filtered.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f._id;
    opt.textContent = `${f.value}（${f.description || f.dataType}）`;
    if (f._id === selectedId) { opt.selected = true; }
    sel.appendChild(opt);
  });
}

/**
 * CSSクラスのチェックボックス一覧を生成する。
 * @param {string[]} [selectedIds] - チェック状態にするCSSクラスIDの配列
 */
function populateCssClassChecks(selectedIds) {
  const container = document.getElementById('fCssClasses');
  container.innerHTML = '';
  const ids = selectedIds || [];
  cssClasses.forEach((css) => {
    const lbl = document.createElement('label');
    const checked = ids.includes(css._id) ? 'checked' : '';
    lbl.innerHTML = `<input type="checkbox" value="${css._id}" ${checked}> ${escHtml(css.value)} <span class="text-muted">${escHtml(css.description || '')}</span>`;
    container.appendChild(lbl);
  });
}

/**
 * 列が選択されていない状態のプレースホルダを表示し、フォームを非表示にする。
 */
function showPlaceholder() {
  document.getElementById('columnForm').classList.add('hidden');
  document.getElementById('editorPlaceholder').classList.remove('hidden');
  document.getElementById('editorActions').style.display = 'none';
  document.getElementById('formTitle').textContent = '列定義フォーム';
  renderPreview(categories, columns);
}

/**
 * 列を選択状態にし、エディタフォームにデータを反映する。
 * @param {string} id - 選択する列ID
 */
function selectColumn(id) {
  commitFormToColumn();
  selectedColumnId = id;
  document.querySelectorAll('.column-item').forEach((el) => {
    el.classList.toggle('selected', el.dataset.colId === id);
  });

  const col = columns.find((c) => c._id === id);
  if (!col) { showPlaceholder(); return; }

  document.getElementById('editorPlaceholder').classList.add('hidden');
  document.getElementById('columnForm').classList.remove('hidden');
  document.getElementById('editorActions').style.display = 'flex';
  document.getElementById('formTitle').textContent = `${col.label}（${col.key}）`;

  document.getElementById('fKey').value = col.key;
  document.getElementById('fLabel').value = col.label;
  document.getElementById('fDataType').value = col.dataType || '';
  document.getElementById('fRequired').checked = col.required || false;
  document.getElementById('fDefault').value = col.defaultValue != null ? col.defaultValue : '';
  document.getElementById('fValidation').value = col.validation ? JSON.stringify(col.validation, null, 2) : '';
  document.getElementById('fValidationError').style.display = 'none';
  document.getElementById('fKeyError').style.display = 'none';

  populateFormatSelect(resolveId(col.formatId) || '', col.dataType);

  populateCssClassChecks((col.cssClassIds || []).map(resolveId));

  updateFormatVisibility(col.dataType);
  renderPreview(categories, columns);
}

/**
 * データ型に応じてフォーマット選択欄の表示・非表示を切り替える。
 * フォーマットは date / number にのみ意味があるため、それ以外は非表示にする。
 * @param {string} dataType - 列のデータ型
 */
function updateFormatVisibility(dataType) {
  const show = dataType === DATA_TYPES.NUMBER || dataType === DATA_TYPES.DATE;
  document.getElementById('fFormatGroup').style.display = show ? '' : 'none';
}

/**
 * 列オブジェクトの編集対象フィールドを比較用に正規化したシグネチャ文字列に変換する。
 * 型の差異（Number/String）やcssClassIdsの並び順の違いを吸収し、
 * フォーム反映の前後で値が実質的に変わったかどうかを判定できるようにする。
 * @param {Object} col - 列オブジェクト
 * @returns {string}
 */
function columnFieldsSignature(col) {
  return JSON.stringify({
    key: col.key,
    label: col.label,
    dataType: col.dataType || null,
    formatId: resolveId(col.formatId) || null,
    cssClassIds: (col.cssClassIds || []).map(resolveId).sort(),
    required: !!col.required,
    defaultValue: col.defaultValue != null ? String(col.defaultValue) : null,
    validation: col.validation ? JSON.stringify(col.validation) : null,
  });
}

/**
 * フォームの現在値を選択中の列のドラフトオブジェクトに書き込む。
 * key/labelが空の場合は更新しない（必須項目を空にできないようにする）。
 * フォームの値が列の現在値と実質的に同じ場合は、変更ありとして扱わない。
 */
function commitFormToColumn() {
  if (!selectedColumnId) { return; }
  const col = columns.find((c) => c._id === selectedColumnId);
  if (!col) { return; }

  const before = columnFieldsSignature(col);

  const key = document.getElementById('fKey').value.trim();
  const label = document.getElementById('fLabel').value.trim();
  const keyErrEl = document.getElementById('fKeyError');
  if (key) {
    const isDuplicate = columns.some((c) => c._id !== selectedColumnId && c.key === key);
    if (isDuplicate) {
      keyErrEl.textContent = 'このキー名はすでに使用されています';
      keyErrEl.style.display = 'block';
    } else {
      keyErrEl.style.display = 'none';
      col.key = key;
    }
  } else {
    keyErrEl.style.display = 'none';
  }
  if (label) { col.label = label; }

  col.dataType = document.getElementById('fDataType').value || null;

  const formatIdVal = document.getElementById('fFormat').value || null;
  col.formatId = formatIdVal ? (formats.find((f) => f._id === formatIdVal) || null) : null;

  const cssIds = [...document.querySelectorAll('#fCssClasses input:checked')].map((el) => el.value);
  col.cssClassIds = cssClasses.filter((c) => cssIds.includes(c._id));

  col.required = document.getElementById('fRequired').checked;
  col.defaultValue = coerceDefaultValue(document.getElementById('fDefault').value.trim(), col.dataType);

  const errEl = document.getElementById('fValidationError');
  const rawVal = document.getElementById('fValidation').value.trim();
  if (!rawVal) {
    col.validation = null;
    errEl.style.display = 'none';
  } else {
    try {
      col.validation = JSON.parse(rawVal);
      errEl.style.display = 'none';
    } catch {
      errEl.textContent = 'JSONの形式が正しくありません';
      errEl.style.display = 'block';
    }
  }

  if (columnFieldsSignature(col) !== before) {
    applyChange();
  }
}

// データ型プルダウンが変更されたら、フォーマット欄の表示切替と選択肢を更新し、フォームの内容をドラフトに反映する
document.getElementById('fDataType').addEventListener('change', () => {
  const dt = document.getElementById('fDataType').value;
  updateFormatVisibility(dt);
  const currentFormatId = document.getElementById('fFormat').value;
  populateFormatSelect(currentFormatId, dt);
  commitFormToColumn();
});

// 「編集をキャンセル」ボタンがクリックされたら、フォームの内容をドラフトに反映してから列の選択を解除する
document.getElementById('cancelEditBtn').addEventListener('click', () => {
  commitFormToColumn();
  selectedColumnId = null;
  showPlaceholder();
  renderSidebar();
});

// ---- Live Preview ----

/** commitFormToColumn をデバウンスした関数（テキスト入力中のプレビュー再描画用）。 */
const debouncedCommit = debounce(commitFormToColumn, UI.DEBOUNCE_PREVIEW_MS);

// フォーム入力欄が変更されたら、ドラフトの列データに反映してプレビューを再描画する（テキスト系はデバウンス）
document.getElementById('fKey').addEventListener('input', debouncedCommit);
document.getElementById('fLabel').addEventListener('input', debouncedCommit);
document.getElementById('fFormat').addEventListener('change', commitFormToColumn);
document.getElementById('fRequired').addEventListener('change', commitFormToColumn);
document.getElementById('fCssClasses').addEventListener('change', commitFormToColumn);
document.getElementById('fDefault').addEventListener('input', debouncedCommit);
document.getElementById('fValidation').addEventListener('input', debouncedCommit);

/**
 * 現在のカテゴリ・列のドラフト状態をAPI送信用payloadに変換する。
 * @returns {{categories: object[], columns: object[]}}
 */
function buildSavePayload() {
  return {
    categories: categories.map((c) => ({ _id: c._id, name: c.name, order: c.order })),
    columns: columns.map((c) => ({
      _id: c._id,
      categoryId: c.categoryId || null,
      key: c.key,
      label: c.label,
      dataType: c.dataType,
      formatId: resolveId(c.formatId),
      cssClassIds: (c.cssClassIds || []).map(resolveId),
      order: c.order,
      required: c.required,
      defaultValue: c.defaultValue,
      validation: c.validation,
    })),
  };
}

// ---- Save ----
// 「保存」ボタンがクリックされたら、フォームの内容を確定してカテゴリ・列のドラフトを一括保存する
document.getElementById('btnSave').addEventListener('click', async(e) => {
  await withLoading(e.currentTarget, async() => {
    commitFormToColumn();

    const payload = buildSavePayload();

    const selColIdx = columns.findIndex((c) => c._id === selectedColumnId);

    const res = await saveProject(projectId, payload);
    if (res.error) { showToast(res.error, 'error'); return; }

    categories = res.data.categories;
    columns = res.data.columns.map((col) => ({ ...col, categoryId: resolveId(col.categoryId) }));
    selectedColumnId = selColIdx >= 0 ? (columns[selColIdx]?._id ?? null) : null;

    showToast(res.data.operationLog ? '保存しました' : '変更はありませんでした');
    renderSidebar();
    if (selectedColumnId) {
      selectColumn(selectedColumnId);
    } else {
      showPlaceholder();
    }
    hasUnsavedChanges = false;
  });
});

// ---- History ----
// 「変更履歴」ボタンがクリックされたら、履歴ページへ遷移する
document.getElementById('btnHistory').addEventListener('click', () => {
  location.href = `/history.html?projectId=${projectId}`;
});

// ---- Snapshot ----
// 「復元ポイントを保存」ボタンがクリックされたら、プリフライトAPIで状態確認後にモーダルを開く
document.getElementById('btnSnapshot').addEventListener('click', async(e) => {
  commitFormToColumn();
  const payload = buildSavePayload();

  let checkResult = null;
  await withLoading(e.currentTarget, async() => {
    const res = await checkSnapshot(projectId, payload);
    if (!res.error) { checkResult = res.data; }
  });

  const warningsEl = document.getElementById('snapshotWarnings');
  const parts = [];
  if (checkResult?.willDelete && checkResult.oldestToDelete) {
    const s = checkResult.oldestToDelete;
    const label = s.name ? `「${escHtml(s.name)}」` : '（名前なし）';
    parts.push(`<p class="snapshot-warning snapshot-warning--danger">保存すると、最も古い復元ポイント${label}（${formatDate(s.savedAt)}）が自動削除されます。</p>`);
  }
  if (checkResult?.existingSnapshot) {
    const s = checkResult.existingSnapshot;
    const label = s.name ? `「${escHtml(s.name)}」` : '（名前なし）';
    parts.push(`<p class="snapshot-warning snapshot-warning--info">同じ内容が${label}（${formatDate(s.savedAt)}）として保存済みです。保存すると名前・保存日時が更新されます。</p>`);
  }
  if (parts.length > 0) {
    warningsEl.innerHTML = parts.join('');
    warningsEl.classList.remove('hidden');
  } else {
    warningsEl.innerHTML = '';
    warningsEl.classList.add('hidden');
  }

  document.getElementById('snapshotNameInput').value = '';
  openModal('snapshotNameModal');
});

// スナップショット名入力モーダルの「保存」ボタンがクリックされたら、復元ポイントを保存する
document.getElementById('snapshotNameModalSave').addEventListener('click', async() => {
  closeModal('snapshotNameModal');
  const name = document.getElementById('snapshotNameInput').value.trim();
  await withLoading(document.getElementById('btnSnapshot'), async() => {
    commitFormToColumn();
    const payload = buildSavePayload();

    const res = await saveSnapshot(projectId, { ...payload, name });
    if (res.error) { showToast(res.error, 'error'); return; }

    if (!res.data.duplicated) {
      showToast('復元ポイントを保存しました');
    } else if (res.data.unchanged) {
      showToast('変更がないため、スキップしました');
    } else {
      showToast('復元ポイントを更新しました');
    }
  });
});

// 「復元ポイント確認」ボタンがクリックされたら、復元ポイント確認ページへ遷移する
document.getElementById('btnSnapshotDiff').addEventListener('click', () => {
  location.href = `/snapshots.html?projectId=${projectId}`;
});

// ---- Export ----
let exportJsonText = '';

// 「エクスポート」ボタンがクリックされたら、列定義のJSONを取得してエクスポートモーダルを開く
document.getElementById('btnExport').addEventListener('click', async(e) => {
  await withLoading(e.currentTarget, async() => {
    const res = await exportProject(projectId);
    if (res.error) { showToast(res.error, 'error'); return; }
    exportJsonText = JSON.stringify(res.data, null, 2);
    document.getElementById('exportJsonPreview').textContent = exportJsonText;
    openModal('exportModal');
  });
});

// エクスポートモーダルの「ダウンロード」ボタンがクリックされたら、表示中のJSONをファイルとしてダウンロードする
document.getElementById('exportDownloadBtn').addEventListener('click', () => {
  const blob = new Blob([exportJsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `columns_${projectId}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---- Init ----
loadAll();
