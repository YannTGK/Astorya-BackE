// models/Photo.js
import mongoose from 'mongoose';

const photoSchema = new mongoose.Schema({
  photoAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhotoAlbum' },
  fileUrl: String,
  uploadedAt: { type: Date, default: Date.now },
});

// Index om sneller foto's op albumId op te vragen
photoSchema.index({ photoAlbumId: 1 });

export default mongoose.model('Photo', photoSchema);