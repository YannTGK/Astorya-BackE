import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star', required: true },
  fileUrl: { type: String, required: true },
  docType: { type: String },
  sharedWith: { type: [String], default: [] },
  addedAt: { type: Date, default: Date.now },
});

documentSchema.index({ starId: 1 });

export default mongoose.model('Document', documentSchema);