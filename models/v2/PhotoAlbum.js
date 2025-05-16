// models/PhotoAlbum.js
import mongoose from 'mongoose';

const photoAlbumSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star' },
  name: String,

  canView: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index om op starId te zoeken
photoAlbumSchema.index({ starId: 1 });

export default mongoose.model('PhotoAlbum', photoAlbumSchema);