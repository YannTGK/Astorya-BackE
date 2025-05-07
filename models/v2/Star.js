import mongoose from "mongoose";

/* willekeur‑range voor nieuwe sterren (gecentreerd rond 0) */
const POSITION_RANGE = 1200;          // ≈ “diameter” van je publieke ruimte
const randomPos = () => (Math.random() - 0.5) * POSITION_RANGE;

const starSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // owner
  isPrivate:   { type: Boolean, default: false },
  starFor:     { type: String,  default: "myself" },

  /* uiterlijk + label */
  color:       String,        // basis‑kleur  (hex “#ffffff”)
  emissive:    String,        // gloed‑kleur  (hex) – voeg toe als je die bewaart
  publicName:  String,
  word:        String,
  activationDate: Date,
  longTermMaintenance:{ type: Boolean, default: false },

  /* 3‑D‑positie */
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  z: { type: Number, required: true },

  /* rechten */
  canView: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

/* indices */
starSchema.index({ userId: 1 });
starSchema.index({ canView: 1 });
starSchema.index({ canEdit: 1 });

export default mongoose.model("Star", starSchema);