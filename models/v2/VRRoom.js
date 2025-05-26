// models/VRRoom.js
import mongoose from 'mongoose';

const vrRoomSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star' },
  
  roomType: { type: String, default: 'basic' },  // bijvoorbeeld "basic", "space", "forest", etc.
  name: { type: String, default: null },           // Naam wordt vaak alleen bij privé-rooms ingevuld
  canView: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model('VRRoom', vrRoomSchema);