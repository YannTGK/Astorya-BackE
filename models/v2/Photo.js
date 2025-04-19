import mongoose from 'mongoose';

const photoSchema = new mongoose.Schema({
  photoAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhotoAlbum' },
  fileUrl:      { type: String, required: true },   // Wasabi‑URL
  addedAt:      { type: Date,   default: Date.now }
});

photoSchema.index({ photoAlbumId: 1 });

export default mongoose.model('Photo', photoSchema);