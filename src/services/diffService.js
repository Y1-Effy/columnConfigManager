const CATEGORY_FIELDS = ['name', 'order'];
const COLUMN_FIELDS = ['key', 'label', 'dataType', 'categoryId', 'formatId', 'cssClassIds', 'order', 'required', 'defaultValue', 'validation'];

const toIdString = (val) => {
  if (val === null || val === undefined) { return null; }
  if (typeof val === 'object' && val._id !== undefined) { return String(val._id); }
  return String(val);
};

const isEqualValue = (field, beforeVal, afterVal) => {
  switch (field) {
    case 'categoryId':
    case 'formatId':
      return toIdString(beforeVal) === toIdString(afterVal);
    case 'cssClassIds': {
      const a = (beforeVal || []).map(toIdString).sort();
      const b = (afterVal || []).map(toIdString).sort();
      return JSON.stringify(a) === JSON.stringify(b);
    }
    case 'defaultValue':
    case 'validation':
      return JSON.stringify(beforeVal ?? null) === JSON.stringify(afterVal ?? null);
    default:
      return (beforeVal ?? null) === (afterVal ?? null);
  }
};

/**
 * フィールドの値を操作ログ表示用の値に変換する。
 * categoryId/formatId/cssClassIds はID参照ではなく名称を解決した値で保存する。
 */
const resolveDisplayValue = (field, val, { categoryNameMap, formats, cssClasses }) => {
  switch (field) {
    case 'categoryId': {
      const id = toIdString(val);
      if (!id) { return null; }
      return { id, name: categoryNameMap.get(id) ?? null };
    }
    case 'formatId': {
      const id = toIdString(val);
      if (!id) { return null; }
      const fmt = formats.find((f) => String(f._id) === id);
      return { id, value: fmt ? fmt.value : null };
    }
    case 'cssClassIds':
      return (val || []).map(toIdString).map((id) => {
        const css = cssClasses.find((c) => String(c._id) === id);
        return { id, value: css ? css.value : null };
      });
    default:
      return val ?? null;
  }
};

const buildIdMap = (docs) => new Map(docs.map((d) => [String(d._id), d]));
const buildCategoryNameMap = (categories) => new Map(categories.map((c) => [String(c._id), c.name]));

const diffEntity = (entityType, beforeDocs, afterDocs, fields, getLabel, ctx) => {
  const beforeMap = buildIdMap(beforeDocs);
  const afterMap = buildIdMap(afterDocs);
  const operations = [];

  for (const [id, beforeDoc] of beforeMap) {
    if (afterMap.has(id)) { continue; }
    operations.push({
      entityType,
      entityId: id,
      action: 'deleted',
      label: getLabel(beforeDoc),
      fields: fields.map((field) => ({
        field,
        before: resolveDisplayValue(field, beforeDoc[field], ctx.before),
        after: null,
      })),
    });
  }

  for (const [id, afterDoc] of afterMap) {
    const beforeDoc = beforeMap.get(id);

    if (!beforeDoc) {
      operations.push({
        entityType,
        entityId: id,
        action: 'created',
        label: getLabel(afterDoc),
        fields: fields.map((field) => ({
          field,
          before: null,
          after: resolveDisplayValue(field, afterDoc[field], ctx.after),
        })),
      });
      continue;
    }

    const changedFields = fields.filter((field) => !isEqualValue(field, beforeDoc[field], afterDoc[field]));
    if (changedFields.length === 0) { continue; }

    operations.push({
      entityType,
      entityId: id,
      action: 'updated',
      label: getLabel(afterDoc),
      fields: changedFields.map((field) => ({
        field,
        before: resolveDisplayValue(field, beforeDoc[field], ctx.before),
        after: resolveDisplayValue(field, afterDoc[field], ctx.after),
      })),
    });
  }

  return operations;
};

/**
 * 保存前後のカテゴリ・列の状態を比較し、操作ログのoperations配列を生成する。
 * @param {object} args
 * @param {object[]} args.beforeCategories - DB上の保存前のカテゴリ一覧
 * @param {object[]} args.afterCategories - 保存後の最終的なカテゴリ一覧
 * @param {object[]} args.beforeColumns - DB上の保存前の列一覧
 * @param {object[]} args.afterColumns - 保存後の最終的な列一覧
 * @param {object[]} args.formats - フォーマットマスタ全件
 * @param {object[]} args.cssClasses - CSSクラスマスタ全件
 * @returns {object[]} operations
 */
const computeDiff = ({ beforeCategories, afterCategories, beforeColumns, afterColumns, formats, cssClasses }) => {
  const ctx = {
    before: { categoryNameMap: buildCategoryNameMap(beforeCategories), formats, cssClasses },
    after: { categoryNameMap: buildCategoryNameMap(afterCategories), formats, cssClasses },
  };

  return [
    ...diffEntity('category', beforeCategories, afterCategories, CATEGORY_FIELDS, (doc) => doc.name, ctx),
    ...diffEntity('column', beforeColumns, afterColumns, COLUMN_FIELDS, (doc) => doc.label, ctx),
  ];
};

export { CATEGORY_FIELDS, COLUMN_FIELDS, computeDiff };
