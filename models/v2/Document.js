// models/Document.js
import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star' },
  fileUrl: String,
  docType: String, // 'pdf', 'docx', ...
  sharedWith: [{ type: String }],
  uploadedAt: { type: Date, default: Date.now },
});

documentSchema.index({ starId: 1 });

export default mongoose.model('Document', documentSchema);