import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: [true, '名前は必須です'], trim: true, maxlength: [50, '名前は50文字以内で入力してください'] },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

categorySchema.index({ projectId: 1, order: 1 });

export default mongoose.model('Category', categorySchema);
