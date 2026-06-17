import { escHtml, formatDate } from './utils.js';

/** エンティティ種別の表示ラベル。 */
export const ENTITY_TYPE_LABELS = {
  category: 'カテゴリ',
  column: '列',
  snapshot: '復元ポイント',
};

/** 操作種別（追加・更新・削除）の表示ラベル。 */
export const ACTION_LABELS = {
  created: '追加',
  updated: '更新',
  deleted: '削除',
};

/** 操作ログのフィールド名に対応する表示ラベル。 */
export const FIELD_LABELS = {
  name: '名前',
  order: '並び順',
  key: 'キー名',
  label: '表示ラベル',
  dataType: 'データ型',
  categoryId: 'カテゴリ',
  formatId: 'フォーマット',
  cssClassIds: 'CSSクラス',
  required: '必須',
  defaultValue: 'デフォルト値',
  validation: 'バリデーション',
  savedAt: '保存日時',
};

/** データ型の表示ラベル。 */
export const DATA_TYPE_LABELS = {
  string: 'string（文字列）',
  number: 'number（数値）',
  date: 'date（日付）',
  boolean: 'boolean（真偽値）',
};

/**
 * 操作ログのフィールド値を表示用文字列に変換する。
 * categoryId/formatId/cssClassIds は { id, name|value } 形式で保存されているため、
 * 名称部分を取り出す。
 * @param {string} field - フィールド名
 * @param {*} val - フィールド値
 * @returns {string}
 */
export function formatFieldValue(field, val) {
  switch (field) {
    case 'savedAt':
      return val ? formatDate(val) : '（なし）';
    case 'categoryId':
      return val ? (val.name ?? '(不明なカテゴリ)') : '（未分類）';
    case 'formatId':
      return val ? (val.value ?? '(不明なフォーマット)') : '（なし）';
    case 'cssClassIds':
      return (val || []).length > 0
        ? val.map((c) => c.value ?? '(不明)').join(', ')
        : '（なし）';
    case 'dataType':
      return val ? (DATA_TYPE_LABELS[val] || val) : '（未設定）';
    case 'required':
      return val ? 'はい' : 'いいえ';
    case 'defaultValue':
    case 'validation':
      if (val === null || val === undefined) { return '（なし）'; }
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    default:
      return val === null || val === undefined || val === '' ? '（なし）' : String(val);
  }
}

/**
 * 追加・削除操作の詳細表示でフィールドを省略すべきか判定する。
 * 並び順・エンティティ自身のラベルフィールド・値が空のフィールドは省略する。
 * @param {string} entityType - 'category' | 'column'
 * @param {string} field - フィールド名
 * @param {*} val - フィールド値
 * @returns {boolean}
 */
export function isOmittedField(entityType, field, val) {
  if (field === 'order') { return true; }
  const labelField = entityType === 'category' ? 'name' : 'label';
  if (field === labelField) { return true; }
  if (val === null || val === undefined) { return true; }
  if (field === 'required' && val === false) { return true; }
  if (field === 'cssClassIds' && (val || []).length === 0) { return true; }
  return false;
}

/**
 * fields配列を before → after 形式の <li> リストに変換する。
 * @param {Object[]} fields - 操作エントリのfields配列
 * @returns {string}
 */
export function renderBeforeAfterList(fields) {
  return fields.map((f) => `
    <li>${escHtml(FIELD_LABELS[f.field] || f.field)}: ${escHtml(formatFieldValue(f.field, f.before))} → ${escHtml(formatFieldValue(f.field, f.after))}</li>
  `).join('');
}

/**
 * 1件の操作エントリを表示用HTMLに変換する。
 * updated は変更フィールドの before → after を、created/deleted は設定値のみを列挙する。
 * snapshot（復元ポイント）は label をそのまま見出しとして表示し、fields があれば before → after を列挙する。
 * @param {Object} op - 操作エントリ
 * @returns {string}
 */
export function renderOperationEntry(op) {
  if (op.entityType === 'snapshot') {
    const fieldsHtml = renderBeforeAfterList(op.fields);
    return `
      <div class="operation-entry">
        <p class="operation-entry-heading">${escHtml(op.label)}</p>
        ${fieldsHtml ? `<ul class="operation-entry-fields">${fieldsHtml}</ul>` : ''}
      </div>
    `;
  }

  const entityLabel = ENTITY_TYPE_LABELS[op.entityType];
  const actionLabel = ACTION_LABELS[op.action];

  let fieldsHtml = '';
  if (op.action === 'updated') {
    fieldsHtml = renderBeforeAfterList(op.fields);
  } else {
    const valueKey = op.action === 'created' ? 'after' : 'before';
    fieldsHtml = op.fields
      .filter((f) => !isOmittedField(op.entityType, f.field, f[valueKey]))
      .map((f) => `<li>${escHtml(FIELD_LABELS[f.field] || f.field)}: ${escHtml(formatFieldValue(f.field, f[valueKey]))}</li>`)
      .join('');
  }

  return `
    <div class="operation-entry">
      <p class="operation-entry-heading">『${escHtml(op.label)}』（${entityLabel}）を${actionLabel}</p>
      ${fieldsHtml ? `<ul class="operation-entry-fields">${fieldsHtml}</ul>` : ''}
    </div>
  `;
}

/**
 * 1件の操作エントリを見出し行のみのHTMLに変換する（フィールド詳細は省略）。
 * @param {Object} op - 操作エントリ
 * @returns {string}
 */
export function renderOperationSummary(op) {
  if (op.entityType === 'snapshot') {
    return `<li>${escHtml(op.label)}</li>`;
  }
  const entityLabel = ENTITY_TYPE_LABELS[op.entityType];
  const actionLabel = ACTION_LABELS[op.action];
  return `<li>『${escHtml(op.label)}』（${entityLabel}）を${actionLabel}</li>`;
}
