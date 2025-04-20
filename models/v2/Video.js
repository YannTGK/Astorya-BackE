import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
  videoAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'VideoAlbum', required: true },
  fileUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

videoSchema.index({ videoAlbumId: 1 });

export default mongoose.model('Video', videoSchema);