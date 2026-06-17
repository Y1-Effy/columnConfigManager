import mongoose from 'mongoose';

const snapshotSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  projectName: { type: String, required: true },
  name: { type: String, default: '' },
  categories: { type: Array, required: true },
  columns: { type: Array, required: true },
  hash: { type: String, required: true },
  savedAt: { type: Date, required: true, default: Date.now },
});

snapshotSchema.index({ projectId: 1, savedAt: -1 });
snapshotSchema.index({ projectId: 1, hash: 1 });

export default mongoose.model('Snapshot', snapshotSchema);
