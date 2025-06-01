import mongoose from "mongoose";

const deathCertificateSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  fileKey:     { type: String, required: true },
  uploadedAt:  { type: Date, default: Date.now },
  verified: {
    type: Boolean,
    default: false,
},
});

export default mongoose.model("DeathCertificate", deathCertificateSchema);