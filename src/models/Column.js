import mongoose from 'mongoose';

import { DATA_TYPES } from '../constants.js';

const columnSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    key: { type: String, required: [true, 'キー名は必須です'], trim: true, maxlength: [50, 'キー名は50文字以内で入力してください'], match: [/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'キー名は英字・数字・アンダースコアのみ使用可（先頭は英字またはアンダースコア）'] },
    label: { type: String, required: [true, '表示ラベルは必須です'], trim: true, maxlength: [100, '表示ラベルは100文字以内で入力してください'] },
    dataType: { type: String, enum: { values: Object.values(DATA_TYPES), message: '無効なデータ型です' } },
    formatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Format' },
    cssClassIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CssClass' }],
      validate: { validator: (v) => v.length <= 20, message: 'CSSクラスは20件以内で指定してください' },
    },
    order: { type: Number, default: 0 },
    required: { type: Boolean, default: false },
    defaultValue: { type: mongoose.Schema.Types.Mixed },
    validation: { type: Object },
  },
  { timestamps: true },
);

columnSchema.index({ projectId: 1, order: 1 });
columnSchema.index({ categoryId: 1 });

export default mongoose.model('Column', columnSchema);
