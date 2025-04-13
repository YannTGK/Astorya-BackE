// models/Star.js
import mongoose from 'mongoose';

const starSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isPrivate: { type: Boolean, default: false },
  starFor: { type: String, default: 'myself' }, // of 'lovedOne' etc.
  color: String,
  word: String,
  activationDate: Date,
  longTermMaintenance: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index om snel sterren per user op te halen
starSchema.index({ userId: 1 });

export default mongoose.model('Star', starSchema);