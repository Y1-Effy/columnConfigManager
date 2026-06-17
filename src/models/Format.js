import mongoose from 'mongoose';

import { FORMAT_DATA_TYPES } from '../constants.js';

const formatSchema = new mongoose.Schema(
  {
    dataType: { type: String, enum: { values: Object.values(FORMAT_DATA_TYPES), message: '無効なデータ型です' }, required: [true, 'データ型は必須です'] },
    value: { type: String, required: [true, '値は必須です'], trim: true, maxlength: [50, '値は50文字以内で入力してください'] },
    description: { type: String, trim: true, maxlength: [200, '説明は200文字以内で入力してください'] },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

formatSchema.index({ dataType: 1, value: 1 }, { unique: true });

export default mongoose.model('Format', formatSchema);
