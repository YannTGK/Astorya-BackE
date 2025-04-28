// models/Star.js
import mongoose from 'mongoose';

const starSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // eigenaar van de ster
  isPrivate: { type: Boolean, default: false },
  starFor: { type: String, default: 'myself' }, // van wie is de ster: 'myself', 'lovedOne', etc.
  color: String,
  word: String,
  publicName: String,
  activationDate: Date,
  longTermMaintenance: { type: Boolean, default: false },

  // Nieuwe velden voor gedeelde toegang
  canView: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // gebruikers die mogen bekijken
  canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // gebruikers die mogen bewerken

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index om snel sterren per user op te halen
starSchema.index({ userId: 1 });

export default mongoose.model('Star', starSchema);