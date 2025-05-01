// models/v2/Star.js
import mongoose from "mongoose";

const starSchema = new mongoose.Schema({
  userId:            { type: mongoose.Schema.Types.ObjectId, ref: "User" },   // eigenaar
  isPrivate:         { type: Boolean,   default: false },
  starFor:           { type: String,    default: "myself" },
  color:             String,
  word:              String,
  publicName:        String,
  activationDate:    Date,
  longTermMaintenance:{ type: Boolean,  default: false },

  /* gedeelde rechten */
  canView: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

/* indices voor snelle queries – belangrijk als lijsten groter worden */
starSchema.index({ userId: 1 });
starSchema.index({ canView: 1 });
starSchema.index({ canEdit: 1 });

export default mongoose.model("Star", starSchema);