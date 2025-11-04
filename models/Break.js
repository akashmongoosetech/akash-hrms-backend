const mongoose = require('mongoose');

const breakSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['Break In', 'Break Out'], required: true },
  reason: { type: String, required: function() { return this.action === 'Break In'; } },
  timestamp: { type: Date, default: Date.now },
  date: { type: String, required: true }, // e.g., '2025-11-04'
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For admin-added breaks
}, { timestamps: true });

module.exports = mongoose.model('Break', breakSchema);