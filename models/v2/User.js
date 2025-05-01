// models/User.js
import mongoose from "mongoose";
import bcrypt   from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    firstName:   { type: String, trim: true },
    lastName:    { type: String, trim: true },

    /* ───  unieke username & e-mail  ─── */
    username: {
      type:     String,
      required: true,
      unique:   true,
      lowercase:true,           //   @zoek-queries worden case-insensitive
      trim:     true,
    },
    email: {
      type:     String,
      required: true,
      unique:   true,
      lowercase:true,
      trim:     true,
    },

    phoneNumber: String,
    dob:         Date,

    password: {
      type:     String,
      required: true,
      select:   false,          // 🔒 niet mee-selecten tenzij expliciet .select("+password")
    },

    isAlive: { type: Boolean, default: true },

    plan: {
      type:    String,
      enum:    ["EXPLORER","PREMIUM","LEGACY"],
      default: "EXPLORER",
    },

    /* ───  contacten  ─── */
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }          // voegt createdAt & updatedAt automatisch toe
);

/* 🔍  snelle username-lookup */
userSchema.index({ username: 1 });

/* ───────────────────────────────────────── password security ── */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model("User", userSchema);