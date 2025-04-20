// models/VideoAlbum.js
import mongoose from 'mongoose';

const videoAlbumSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: 'Star', required: true },
  name: { type: String, required: true },
  sharedWith: { type: [String], default: [] }, // Add this line
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

videoAlbumSchema.index({ starId: 1 });

export default mongoose.model('VideoAlbum', videoAlbumSchema);