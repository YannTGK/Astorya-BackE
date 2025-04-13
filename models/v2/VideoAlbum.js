// models/VideoAlbum.js
import mongoose from 'mongoose';

const videoAlbumSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star' },
  name: String,
  sharedWith: [{ type: String }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

videoAlbumSchema.index({ starId: 1 });

export default mongoose.model('VideoAlbum', videoAlbumSchema);