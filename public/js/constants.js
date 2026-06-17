/** 日付・数値のフォーマットに使用するロケール。 */
export const LOCALE = 'ja-JP';

/** 列のデータ型を表す定数。 */
export const DATA_TYPES = {
  STRING: 'string',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'boolean',
};

/** UIのレイアウト・挙動に関する定数（ペイン幅の初期値・上下限、デバウンス時間など）。 */
export const UI = {
  DEBOUNCE_PREVIEW_MS: 150,
  PREVIEW_SAMPLE_ROWS: 3,
  SIDEBAR_MIN_WIDTH: 200,
  SIDEBAR_MAX_WIDTH: 480,
  SIDEBAR_DEFAULT_WIDTH: 260,
  PREVIEW_MIN_WIDTH: 140,
  PREVIEW_MAX_WIDTH: 1000,
  PREVIEW_DEFAULT_WIDTH: 300,
  SNAPSHOT_PANE_MIN_WIDTH: 180,
  SNAPSHOT_PANE_MAX_WIDTH: 400,
  SNAPSHOT_PANE_DEFAULT_WIDTH: 240,
};
