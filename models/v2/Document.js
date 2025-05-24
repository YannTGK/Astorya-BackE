import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  starId : { type: mongoose.Schema.Types.ObjectId, ref: "Star", required: true },

  /** Enige opslag in DB = S3-key (géén publieke URL) */
  key    : { type: String, required: true },
  docType: { type: String, default: "pdf" },

  canView: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  addedAt: { type: Date, default: Date.now },
});

documentSchema.index({ starId: 1 });

export default mongoose.model("Document", documentSchema);