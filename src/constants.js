const DATA_TYPES = Object.freeze({
  STRING: 'string',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'boolean',
});

const FORMAT_DATA_TYPES = Object.freeze({
  DATE: 'Date',
  NUMBER: 'Number',
});

/** 列のdataTypeに対して許可されるフォーマットマスタのdataType。 */
const FORMAT_DATA_TYPE_BY_COLUMN_TYPE = Object.freeze({
  [DATA_TYPES.DATE]: FORMAT_DATA_TYPES.DATE,
  [DATA_TYPES.NUMBER]: FORMAT_DATA_TYPES.NUMBER,
});

const RATE_LIMIT = Object.freeze({
  WINDOW_MS: 15 * 60 * 1000,
  MAX: 200,
});

export { DATA_TYPES, FORMAT_DATA_TYPE_BY_COLUMN_TYPE, FORMAT_DATA_TYPES, RATE_LIMIT };
