import {
  createCssClass, createFormat, deleteCssClass, deleteFormat,
  getCssClasses, getFormats, updateCssClass, updateFormat,
} from './api.js';
import { closeModal, escHtml, initModalDelegation, openConfirmModal, openModal, showToast, withLoading } from './utils.js';

initModalDelegation();

let allFormats = [];
let allCssClasses = [];

/**
 * マスタ管理テーブル（フォーマット・CSSクラス）の共通描画ヘルパー。
 * items が空の場合は emptyMessage を、それ以外は rowTemplate で生成した各行を表示する。
 * @param {string} tbodyId - 描画対象の<tbody>要素のID
 * @param {Object[]} items - 描画するデータの配列
 * @param {string} emptyMessage - items が空の場合に表示する<tr>のHTML
 * @param {(item: Object) => string} rowTemplate - 1件分の<tr>のHTML文字列を生成する関数
 */
function renderMasterTable(tbodyId, items, emptyMessage, rowTemplate) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = items.length === 0 ? emptyMessage : items.map(rowTemplate).join('');
}

// ---- Formats ----

/**
 * APIからフォーマットマスタ一覧を取得してテーブルに描画する。
 * @returns {Promise<void>}
 */
async function loadFormats() {
  const res = await getFormats();
  if (res.error) { showToast(res.error, 'error'); return; }
  allFormats = res.data;
  renderFormats();
}

/**
 * allFormats 配列をもとにフォーマットテーブルを描画する。
 * データが空の場合はメッセージ行を表示する。
 */
function renderFormats() {
  renderMasterTable(
    'formatTbody',
    allFormats,
    '<tr><td colspan="4" class="text-muted">フォーマットがありません。＋フォーマットを追加してください。</td></tr>',
    (f) => `
    <tr>
      <td>${escHtml(f.dataType)}</td>
      <td><code>${escHtml(f.value)}</code></td>
      <td>${escHtml(f.description || '')}</td>
      <td class="td-actions">
        <div class="actions-row">
          <button class="btn btn-outline btn-sm" data-fmt-edit="${f._id}">編集</button>
          <button class="btn btn-danger btn-sm" data-fmt-del="${f._id}">削除</button>
        </div>
      </td>
    </tr>
  `,
  );
}

// テーブル内の「編集」「削除」ボタンがクリックされたら、編集モーダルを開く、または確認後にフォーマットを削除する
document.getElementById('formatTbody').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) { return; }
  if (btn.dataset.fmtEdit) {
    const f = allFormats.find((x) => x._id === btn.dataset.fmtEdit);
    if (f) { openFormatModal(f); }
  }
  if (btn.dataset.fmtDel) {
    const fmtDelId = btn.dataset.fmtDel;
    openConfirmModal('このフォーマットを削除しますか？', async() => {
      const res = await deleteFormat(fmtDelId);
      if (res.error) { showToast(res.error, 'error'); return; }
      showToast('フォーマットを削除しました');
      await loadFormats();
    });
  }
});

// 「＋フォーマットを追加」ボタンがクリックされたら、フォーマット追加モーダルを開く
document.getElementById('addFormatBtn').addEventListener('click', () => openFormatModal(null));

/**
 * フォーマット追加・編集モーダルを開く。
 * f が指定された場合は編集モードでフォームに既存値を設定する。
 * @param {Object|null} f - 編集するフォーマットオブジェクト（新規追加の場合はnull）
 */
function openFormatModal(f) {
  document.getElementById('formatModalTitle').textContent = f ? 'フォーマット編集' : 'フォーマット追加';
  document.getElementById('formatModalId').value = f ? f._id : '';
  document.getElementById('formatModalType').value = f ? f.dataType : 'Date';
  document.getElementById('formatModalValue').value = f ? f.value : '';
  document.getElementById('formatModalDesc').value = f ? (f.description || '') : '';
  document.getElementById('formatModalOrder').value = f ? f.order : allFormats.length;
  openModal('formatModal');
  document.getElementById('formatModalValue').focus();
}

// フォーマットモーダルの「保存」ボタンがクリックされたら、入力値を検証して新規作成または更新を行い、一覧を再読み込みする
document.getElementById('formatModalSave').addEventListener('click', async(e) => {
  const dataType = document.getElementById('formatModalType').value;
  const value = document.getElementById('formatModalValue').value.trim();
  if (!value) { showToast('値は必須です', 'error'); return; }
  const description = document.getElementById('formatModalDesc').value.trim();
  const order = parseInt(document.getElementById('formatModalOrder').value, 10) || 0;
  const id = document.getElementById('formatModalId').value;
  await withLoading(e.currentTarget, async() => {
    const res = id
      ? await updateFormat(id, { dataType, value, description, order })
      : await createFormat({ dataType, value, description, order });
    if (res.error) { showToast(res.error, 'error'); return; }
    closeModal('formatModal');
    showToast(id ? 'フォーマットを更新しました' : 'フォーマットを追加しました');
    await loadFormats();
  });
});

// ---- CssClasses ----

/**
 * APIからCSSクラスマスタ一覧を取得してテーブルに描画する。
 * @returns {Promise<void>}
 */
async function loadCssClasses() {
  const res = await getCssClasses();
  if (res.error) { showToast(res.error, 'error'); return; }
  allCssClasses = res.data;
  renderCssClasses();
}

/**
 * allCssClasses 配列をもとにCSSクラステーブルを描画する。
 * データが空の場合はメッセージ行を表示する。
 */
function renderCssClasses() {
  renderMasterTable(
    'cssTbody',
    allCssClasses,
    '<tr><td colspan="3" class="text-muted">CSSクラスがありません。＋CSSクラスを追加してください。</td></tr>',
    (c) => `
    <tr>
      <td><code>${escHtml(c.value)}</code></td>
      <td>${escHtml(c.description || '')}</td>
      <td class="td-actions">
        <div class="actions-row">
          <button class="btn btn-outline btn-sm" data-css-edit="${c._id}">編集</button>
          <button class="btn btn-danger btn-sm" data-css-del="${c._id}">削除</button>
        </div>
      </td>
    </tr>
  `,
  );
}

// テーブル内の「編集」「削除」ボタンがクリックされたら、編集モーダルを開く、または確認後にCSSクラスを削除する
document.getElementById('cssTbody').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) { return; }
  if (btn.dataset.cssEdit) {
    const c = allCssClasses.find((x) => x._id === btn.dataset.cssEdit);
    if (c) { openCssModal(c); }
  }
  if (btn.dataset.cssDel) {
    const cssDelId = btn.dataset.cssDel;
    openConfirmModal('このCSSクラスを削除しますか？', async() => {
      const res = await deleteCssClass(cssDelId);
      if (res.error) { showToast(res.error, 'error'); return; }
      showToast('CSSクラスを削除しました');
      await loadCssClasses();
    });
  }
});

// 「＋CSSクラスを追加」ボタンがクリックされたら、CSSクラス追加モーダルを開く
document.getElementById('addCssBtn').addEventListener('click', () => openCssModal(null));

/**
 * CSSクラス追加・編集モーダルを開く。
 * c が指定された場合は編集モードでフォームに既存値を設定する。
 * @param {Object|null} c - 編集するCSSクラスオブジェクト（新規追加の場合はnull）
 */
function openCssModal(c) {
  document.getElementById('cssModalTitle').textContent = c ? 'CSSクラス編集' : 'CSSクラス追加';
  document.getElementById('cssModalId').value = c ? c._id : '';
  document.getElementById('cssModalValue').value = c ? c.value : '';
  document.getElementById('cssModalDesc').value = c ? (c.description || '') : '';
  document.getElementById('cssModalOrder').value = c ? c.order : allCssClasses.length;
  openModal('cssModal');
  document.getElementById('cssModalValue').focus();
}

// CSSクラスモーダルの「保存」ボタンがクリックされたら、入力値を検証して新規作成または更新を行い、一覧を再読み込みする
document.getElementById('cssModalSave').addEventListener('click', async(e) => {
  const value = document.getElementById('cssModalValue').value.trim();
  if (!value) { showToast('クラス名は必須です', 'error'); return; }
  const description = document.getElementById('cssModalDesc').value.trim();
  const order = parseInt(document.getElementById('cssModalOrder').value, 10) || 0;
  const id = document.getElementById('cssModalId').value;
  await withLoading(e.currentTarget, async() => {
    const res = id
      ? await updateCssClass(id, { value, description, order })
      : await createCssClass({ value, description, order });
    if (res.error) { showToast(res.error, 'error'); return; }
    closeModal('cssModal');
    showToast(id ? 'CSSクラスを更新しました' : 'CSSクラスを追加しました');
    await loadCssClasses();
  });
});

// ---- Sidebar navigation ----

/** 設定ページのナビゲーション項目と対応するセクション要素のマッピング。 */
const settingsSections = {
  format: document.getElementById('formatSection'),
  css: document.getElementById('cssSection'),
};

document.querySelectorAll('.settings-nav-item').forEach((item) => {
  // サイドバーのナビゲーション項目がクリックされたら、選択状態を切り替えて対応するセクションのみ表示する
  item.addEventListener('click', () => {
    const target = item.dataset.settingsNav;
    document.querySelectorAll('.settings-nav-item').forEach((el) => {
      el.classList.toggle('selected', el === item);
    });
    Object.entries(settingsSections).forEach(([key, section]) => {
      section.classList.toggle('hidden', key !== target);
    });
  });
});

// ---- Init ----
Promise.all([loadFormats(), loadCssClasses()]);
