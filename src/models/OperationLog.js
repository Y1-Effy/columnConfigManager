import mongoose from 'mongoose';

const fieldDiffSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const operationEntrySchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ['category', 'column', 'snapshot'], required: true },
    entityId: { type: String, required: true },
    action: { type: String, enum: ['created', 'updated', 'deleted'], required: true },
    label: { type: String, required: true },
    fields: { type: [fieldDiffSchema], default: [] },
  },
  { _id: false },
);

const operationLogSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    operations: { type: [operationEntrySchema], required: true },
  },
  { timestamps: true },
);

operationLogSchema.index({ projectId: 1, createdAt: -1, _id: -1 });

export default mongoose.model('OperationLog', operationLogSchema);
