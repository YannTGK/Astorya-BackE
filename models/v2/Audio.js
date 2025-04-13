// models/Audio.js
import mongoose from 'mongoose';

const audioSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star' },
  title: String,
  description: String,
  fileUrl: String,
  sharedWith: [{ type: String }], // E-mails of user-ids
  uploadedAt: { type: Date, default: Date.now },
});

audioSchema.index({ starId: 1 });

export default mongoose.model('Audio', audioSchema);