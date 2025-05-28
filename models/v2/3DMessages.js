// models/v2/Message.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  starId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Star',    required: true },
  roomId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ThreeDRoom', required: true },
  message: { type: String,   required: true },
  sender:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  canView: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  addedAt: { type: Date,     default: Date.now },
});

// compound index for fast room lookup
messageSchema.index({ starId: 1, roomId: 1 });

export default mongoose.model('Message', messageSchema);