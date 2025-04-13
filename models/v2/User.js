// models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  username: { type: String, unique: true },   // Unieke username
  email: { type: String, unique: true },      // Unieke email
  phoneNumber: String,
  dob: Date,
  password: String,
  isAlive: { type: Boolean, default: true },
  plan: { type: String, default: 'EXPLORER' }, // of 'PREMIUM' etc.

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// 🔒 Hash password voor opslag
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// 🔒 Check password
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Mongoose indexen (optioneel als je ze niet al in je schema hebt)
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

export default mongoose.model('User', userSchema);