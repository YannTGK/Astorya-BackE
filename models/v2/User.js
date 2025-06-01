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
    dod: { type: Date, default: null }, // ← Nieuw veld toevoegen

    country: {
      type: String,
      default: "Belgium"
    },

    password: {
      type:     String,
      required: true,
    },

    isAlive: { type: Boolean, default: true },

    activationCode: {
      type: String,
      unique: true,
      lowercase: true,
    },

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

  //activation code genereren als deze nog niet bestaat
  if (!this.activationCode) {
    const generateCode = async () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let code;
      let exists = true;
  
      while (exists) {
        code = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        exists = await mongoose.models.User.exists({ activationCode: code });
      }
  
      return code;
    };
  
    this.activationCode = await generateCode();
  }
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model("User", userSchema);