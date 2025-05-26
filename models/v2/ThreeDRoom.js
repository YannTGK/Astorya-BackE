// models/v2/ThreeDRoom.js
import mongoose from 'mongoose';

const threeDRoomSchema = new mongoose.Schema(
  {
    starId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Star', required: true },

    roomType: { type: String, default: 'basic' },   // bv. "basic", "space", "forest" …
    name:     { type: String, default: null },

    canView: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }                               // ⬅️ createdAt + updatedAt automatisch
);

export default mongoose.model('ThreeDRoom', threeDRoomSchema);