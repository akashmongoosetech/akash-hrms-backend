const mongoose = require('mongoose');

const careerSyncHistorySchema = new mongoose.Schema({
  syncDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['Success', 'Failed'], required: true },
  totalFetched: { type: Number, default: 0 },
  newRecords: { type: Number, default: 0 },
  updatedRecords: { type: Number, default: 0 },
  deletedRecords: { type: Number, default: 0 },
  unchangedRecords: { type: Number, default: 0 },
  newRecordTitles: [{ type: String }],
  updatedRecordTitles: [{ type: String }],
  deletedRecordTitles: [{ type: String }],
  errorMessage: String,
  triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('CareerSyncHistory', careerSyncHistorySchema);
