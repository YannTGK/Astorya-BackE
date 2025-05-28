import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  starId: { type: mongoose.Schema.Types.ObjectId, ref: "Star", required: true },
  roomId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ThreeDRoom', required: true },
  /*  opslag-key in Wasabi  (b.v. stars/STARID/documents/1717…-invoice.pdf)  */
  key: { type: String, required: true },

  /*  originele bestandsnaam die we tonen in de UI  */
  originalName: { type: String, required: true },

  docType: { type: String, default: "pdf" },

  canView: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  addedAt: { type: Date, default: Date.now },
});

documentSchema.index({ starId: 1 });

export default mongoose.model("ThreeDRoomDocument", documentSchema);