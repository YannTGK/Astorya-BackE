// models/Video.js
import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
  videoAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'VideoAlbum' },
  fileUrl: String,
  uploadedAt: { type: Date, default: Date.now },
});

videoSchema.index({ videoAlbumId: 1 });

export default mongoose.model('Video', videoSchema);