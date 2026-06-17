import { DATA_TYPES, LOCALE, UI } from './constants.js';
import { escHtml } from './utils.js';

const SAMPLE_ROWS = UI.PREVIEW_SAMPLE_ROWS;
/** プレビュー表示用のデータ型別サンプル値（行インデックスで循環取得する）。 */
const SAMPLE_VALUES = {
  [DATA_TYPES.STRING]: ['田中 太郎', '佐藤 花子', 'テスト商品'],
  [DATA_TYPES.NUMBER]: [1234, 56789, 300],
  [DATA_TYPES.DATE]: ['2024-01-15', '2024-06-30', '2024-12-01'],
  [DATA_TYPES.BOOLEAN]: [true, false, true],
};

/** プレビュー表示で列が無い場合のデフォルトメッセージ。 */
const DEFAULT_EMPTY_MESSAGE = '列がありません。列を追加するとプレビューが表示されます。';

/**
 * プレビュー表示用のサンプル値を返す。データ型に合った配列から行インデックスで循環取得する。
 * @param {string} dataType - 列のデータ型
 * @param {number} rowIdx - 行インデックス
 * @returns {string|number|boolean}
 */
function getSampleValue(dataType, rowIdx) {
  const arr = SAMPLE_VALUES[dataType] || SAMPLE_VALUES[DATA_TYPES.STRING];
  return arr[rowIdx % arr.length];
}

/**
 * 値をフォーマット文字列に従って整形した文字列を返す。
 * 日付: yyyy=年, MM=月, dd=日 のプレースホルダを文字列置換する。
 * 数値: n0=整数, n2=小数2桁, #,##0=3桁区切り, #,##0.00=小数2桁付き3桁区切り。
 * @param {string|number} value - フォーマット前の値
 * @param {string} formatValue - フォーマット指定文字列
 * @param {string} dataType - データ型 ('date' | 'number')
 * @returns {string}
 */
function applyFormat(value, formatValue, dataType) {
  if (!formatValue) { return String(value ?? ''); }
  if (dataType === DATA_TYPES.DATE) {
    const parts = String(value).split('-');
    if (parts.length !== 3) { return String(value); }
    const [y, m, d] = parts;
    return formatValue.replace('yyyy', y).replace('MM', m).replace('dd', d);
  }
  if (dataType === DATA_TYPES.NUMBER) {
    const num = Number(value);
    if (isNaN(num)) { return String(value); }
    if (formatValue === 'n0') { return num.toFixed(0); }
    if (formatValue === 'n2') { return num.toFixed(2); }
    if (formatValue === '#,##0') { return num.toLocaleString(LOCALE, { maximumFractionDigits: 0 }); }
    if (formatValue === '#,##0.00') { return num.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  }
  return String(value ?? '');
}

/**
 * カテゴリ順 → 未分類の順に列を並べた配列を返す。
 * @param {Object[]} categories - カテゴリ配列
 * @param {Object[]} displayCols - 表示対象の列配列
 * @returns {Object[]}
 */
function getSortedDisplayColumns(categories, displayCols) {
  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
  const sorted = [];
  categories.forEach((cat) => {
    sorted.push(...displayCols.filter((c) => c.categoryId === cat._id).sort(byOrder));
  });
  sorted.push(...displayCols.filter((c) => !c.categoryId).sort(byOrder));
  return sorted;
}

/**
 * 1セルの表示値を返す。データ型・フォーマット・サンプル値を合成する。
 * @param {Object} col - 列オブジェクト
 * @param {number} rowIdx - 行インデックス
 * @returns {string}
 */
function renderCellValue(col, rowIdx) {
  const dt = col.dataType || DATA_TYPES.STRING;
  const raw = getSampleValue(dt, rowIdx);
  if (dt === DATA_TYPES.BOOLEAN) { return raw ? '○' : '×'; }
  const fmtObj = col.formatId && typeof col.formatId === 'object' ? col.formatId : null;
  return fmtObj ? applyFormat(raw, fmtObj.value, dt) : String(raw);
}

/**
 * プレビューテーブルをレンダリングする。
 * 列はカテゴリ順 → 未分類の順で並べ、サンプルデータにフォーマットとCSSクラスを適用する。
 * @param {Object[]} categories - カテゴリ配列
 * @param {Object[]} columns - 列配列
 * @param {string} [emptyMessage] - 列が無い場合に表示するメッセージ
 */
export function renderPreview(categories, columns, emptyMessage = DEFAULT_EMPTY_MESSAGE) {
  const wrap = document.getElementById('previewTableWrap');
  const empty = document.getElementById('previewEmpty');
  const table = document.getElementById('previewTable');

  if (columns.length === 0) {
    wrap.classList.add('hidden');
    empty.textContent = emptyMessage;
    empty.classList.remove('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  empty.classList.add('hidden');

  const sorted = getSortedDisplayColumns(categories, columns);

  let html = '<thead><tr>';
  sorted.forEach((col) => {
    const req = col.required ? ' <span class="preview-required">*</span>' : '';
    html += `<th scope="col">${escHtml(col.label)}${req}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (let i = 0; i < SAMPLE_ROWS; i++) {
    html += '<tr>';
    sorted.forEach((col) => {
      const cell = renderCellValue(col, i);
      const cssVals = (col.cssClassIds || [])
        .map((c) => (c && typeof c === 'object' ? c.value : ''))
        .filter(Boolean)
        .join(' ');
      html += `<td class="${escHtml(cssVals)}">${escHtml(cell)}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody>';
  table.innerHTML = html;
}
