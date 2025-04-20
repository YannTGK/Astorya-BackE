import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star', required: true },
  message: { type: String, required: true },
  sender: { type: String, default: 'Anonymous' },
  sharedWith: { type: [String], default: [] },
  addedAt: { type: Date, default: Date.now },
});

messageSchema.index({ starId: 1 });

export default mongoose.model('Message', messageSchema);