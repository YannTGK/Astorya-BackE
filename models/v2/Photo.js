import mongoose from 'mongoose';

const photoSchema = new mongoose.Schema({
  photoAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhotoAlbum' },
  key:          { type: String, required: true },   // S3 object-key
  addedAt:      { type: Date,   default: Date.now },
});

photoSchema.index({ photoAlbumId: 1 });

export default mongoose.model('Photo', photoSchema);