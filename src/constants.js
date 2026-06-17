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

const RATE_LIMIT = Object.freeze({
  WINDOW_MS: 15 * 60 * 1000,
  MAX: 200,
});

export { DATA_TYPES, FORMAT_DATA_TYPES, RATE_LIMIT };
