import mongoose from 'mongoose';

const audioSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star', required: true },
  title: { type: String },
  description: { type: String },
  key:          { type: String, required: true },   // S3 object-key
  canView: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  addedAt: { type: Date, default: Date.now },
});

audioSchema.index({ starId: 1 });

export default mongoose.model('Audio', audioSchema);