import mongoose from "mongoose";

const VideoSchema = new mongoose.Schema({
  videoAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: "VideoAlbum", required: true },
  key:          { type: String, required: true }, // <-- gebruik key, niet fileUrl!
  addedAt:      { type: Date,   default: Date.now },
});

VideoSchema.index({ videoAlbumId: 1 });

export default mongoose.model("Video", VideoSchema);