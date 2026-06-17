import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, '名前は必須です'], trim: true, maxlength: [100, '名前は100文字以内で入力してください'] },
    description: { type: String, trim: true, maxlength: [500, '説明は500文字以内で入力してください'] },
  },
  { timestamps: true },
);

projectSchema.index({ createdAt: -1 });

export default mongoose.model('Project', projectSchema);
