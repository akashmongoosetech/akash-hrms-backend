const mongoose = require('mongoose');

const careerSyncLockSchema = new mongoose.Schema({
  lockedAt: { type: Date, required: true },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('CareerSyncLock', careerSyncLockSchema);
