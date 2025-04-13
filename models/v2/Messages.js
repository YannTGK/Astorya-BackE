// models/Message.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star' },
  message: String,
  sender: String,
  sharedWith: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ starId: 1 });

export default mongoose.model('Message', messageSchema);