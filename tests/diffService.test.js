import { computeDiff } from '../src/services/diffService.js';

const formats = [{ _id: 'fmt1', value: '¥#,##0', dataType: 'Number' }];
const cssClasses = [
  { _id: 'css1', value: 'text-right', description: '右寄せ' },
  { _id: 'css2', value: 'text-bold', description: '太字' },
];

const baseColumn = {
  _id: 'col1',
  key: 'price',
  label: '価格',
  dataType: 'number',
  categoryId: 'cat1',
  formatId: null,
  cssClassIds: [],
  order: 0,
  required: false,
  defaultValue: null,
  validation: null,
};

const baseCategory = { _id: 'cat1', name: '基本情報', order: 0 };

describe('computeDiff', () => {
  it('returns no operations when nothing changed', () => {
    const ops = computeDiff({
      beforeCategories: [baseCategory],
      afterCategories: [baseCategory],
      beforeColumns: [baseColumn],
      afterColumns: [baseColumn],
      formats,
      cssClasses,
    });
    expect(ops).toEqual([]);
  });

  it('detects a created category', () => {
    const ops = computeDiff({
      beforeCategories: [baseCategory],
      afterCategories: [baseCategory, { _id: 'cat2', name: '詳細情報', order: 1 }],
      beforeColumns: [],
      afterColumns: [],
      formats,
      cssClasses,
    });

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entityType: 'category', entityId: 'cat2', action: 'created', label: '詳細情報' });
    expect(ops[0].fields).toEqual([
      { field: 'name', before: null, after: '詳細情報' },
      { field: 'order', before: null, after: 1 },
    ]);
  });

  it('detects an updated category (name and order)', () => {
    const ops = computeDiff({
      beforeCategories: [baseCategory],
      afterCategories: [{ _id: 'cat1', name: '基本情報２', order: 1 }],
      beforeColumns: [],
      afterColumns: [],
      formats,
      cssClasses,
    });

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entityType: 'category', entityId: 'cat1', action: 'updated', label: '基本情報２' });
    expect(ops[0].fields).toEqual([
      { field: 'name', before: '基本情報', after: '基本情報２' },
      { field: 'order', before: 0, after: 1 },
    ]);
  });

  it('detects a deleted category', () => {
    const ops = computeDiff({
      beforeCategories: [baseCategory],
      afterCategories: [],
      beforeColumns: [],
      afterColumns: [],
      formats,
      cssClasses,
    });

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entityType: 'category', entityId: 'cat1', action: 'deleted', label: '基本情報' });
    expect(ops[0].fields).toEqual([
      { field: 'name', before: '基本情報', after: null },
      { field: 'order', before: 0, after: null },
    ]);
  });

  it('detects a created column and resolves formatId/cssClassIds/categoryId', () => {
    const created = {
      ...baseColumn,
      _id: 'col2',
      key: 'amount',
      label: '金額',
      formatId: 'fmt1',
      cssClassIds: ['css1'],
      order: 1,
      required: true,
      defaultValue: 0,
      validation: { min: 0 },
    };

    const ops = computeDiff({
      beforeCategories: [baseCategory],
      afterCategories: [baseCategory],
      beforeColumns: [baseColumn],
      afterColumns: [baseColumn, created],
      formats,
      cssClasses,
    });

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entityType: 'column', entityId: 'col2', action: 'created', label: '金額' });

    const byField = Object.fromEntries(ops[0].fields.map((f) => [f.field, f]));
    expect(byField.categoryId).toEqual({ field: 'categoryId', before: null, after: { id: 'cat1', name: '基本情報' } });
    expect(byField.formatId).toEqual({ field: 'formatId', before: null, after: { id: 'fmt1', value: '¥#,##0' } });
    expect(byField.cssClassIds).toEqual({ field: 'cssClassIds', before: null, after: [{ id: 'css1', value: 'text-right' }] });
    expect(byField.required).toEqual({ field: 'required', before: null, after: true });
    expect(byField.defaultValue).toEqual({ field: 'defaultValue', before: null, after: 0 });
    expect(byField.validation).toEqual({ field: 'validation', before: null, after: { min: 0 } });
  });

  it('detects a deleted column with all fields resolved on the before side', () => {
    const ops = computeDiff({
      beforeCategories: [baseCategory],
      afterCategories: [baseCategory],
      beforeColumns: [baseColumn],
      afterColumns: [],
      formats,
      cssClasses,
    });

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entityType: 'column', entityId: 'col1', action: 'deleted', label: '価格' });

    const byField = Object.fromEntries(ops[0].fields.map((f) => [f.field, f]));
    expect(byField.categoryId).toEqual({ field: 'categoryId', before: { id: 'cat1', name: '基本情報' }, after: null });
    expect(byField.label).toEqual({ field: 'label', before: '価格', after: null });
  });

  it('detects categoryId change and resolves names from before/after category state', () => {
    const beforeCategories = [baseCategory, { _id: 'cat2', name: '詳細情報', order: 1 }];
    const afterCategories = [{ _id: 'cat1', name: '基本情報（旧）', order: 0 }, { _id: 'cat2', name: '詳細情報', order: 1 }];
    const beforeColumns = [baseColumn];
    const afterColumns = [{ ...baseColumn, categoryId: 'cat2' }];

    const ops = computeDiff({ beforeCategories, afterCategories, beforeColumns, afterColumns, formats, cssClasses });

    const categoryOp = ops.find((op) => op.entityType === 'category');
    expect(categoryOp).toMatchObject({ entityId: 'cat1', action: 'updated' });
    expect(categoryOp.fields).toEqual([{ field: 'name', before: '基本情報', after: '基本情報（旧）' }]);

    const columnOp = ops.find((op) => op.entityType === 'column');
    expect(columnOp.fields).toEqual([
      { field: 'categoryId', before: { id: 'cat1', name: '基本情報' }, after: { id: 'cat2', name: '詳細情報' } },
    ]);
  });

  it('treats null and undefined as equal for defaultValue/validation', () => {
    const ops = computeDiff({
      beforeCategories: [baseCategory],
      afterCategories: [baseCategory],
      beforeColumns: [{ ...baseColumn, defaultValue: undefined, validation: undefined }],
      afterColumns: [{ ...baseColumn, defaultValue: null, validation: null }],
      formats,
      cssClasses,
    });
    expect(ops).toEqual([]);
  });

  it('detects defaultValue/validation content changes', () => {
    const ops = computeDiff({
      beforeCategories: [baseCategory],
      afterCategories: [baseCategory],
      beforeColumns: [baseColumn],
      afterColumns: [{ ...baseColumn, defaultValue: 100, validation: { min: 0, max: 100 } }],
      formats,
      cssClasses,
    });

    expect(ops).toHaveLength(1);
    const byField = Object.fromEntries(ops[0].fields.map((f) => [f.field, f]));
    expect(byField.defaultValue).toEqual({ field: 'defaultValue', before: null, after: 100 });
    expect(byField.validation).toEqual({ field: 'validation', before: null, after: { min: 0, max: 100 } });
  });

  it('ignores cssClassIds order when comparing', () => {
    const ops = computeDiff({
      beforeCategories: [baseCategory],
      afterCategories: [baseCategory],
      beforeColumns: [{ ...baseColumn, cssClassIds: ['css1', 'css2'] }],
      afterColumns: [{ ...baseColumn, cssClassIds: ['css2', 'css1'] }],
      formats,
      cssClasses,
    });
    expect(ops).toEqual([]);
  });
});
