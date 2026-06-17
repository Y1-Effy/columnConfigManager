import mongoose from 'mongoose';

const cssClassSchema = new mongoose.Schema(
  {
    value: { type: String, required: [true, '値は必須です'], trim: true, maxlength: [100, '値は100文字以内で入力してください'] },
    description: { type: String, trim: true, maxlength: [200, '説明は200文字以内で入力してください'] },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

cssClassSchema.index({ value: 1 }, { unique: true });

export default mongoose.model('CssClass', cssClassSchema);
