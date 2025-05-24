import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  starId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Star', 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  canView: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  ],
  canEdit: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  ],
  addedAt: { 
    type: Date, 
    default: Date.now 
  },
});

// index voor queries op starId
messageSchema.index({ starId: 1 });

export default mongoose.model('Message', messageSchema);