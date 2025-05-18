import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
  videoAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'VideoAlbum', required: true },
  key:          { type: String, required: true },   // S3 object-key
  addedAt:      { type: Date,   default: Date.now },
});

videoSchema.index({ videoAlbumId: 1 });

videoSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Video', videoSchema);