// models/PhotoAlbum.js
import mongoose from 'mongoose';

const photoAlbumSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star' },
  name: String,

  // Delen op album-niveau
  sharedWith: [{ type: String }], // E-mails of user-ids

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index om op starId te zoeken
photoAlbumSchema.index({ starId: 1 });

export default mongoose.model('PhotoAlbum', photoAlbumSchema);