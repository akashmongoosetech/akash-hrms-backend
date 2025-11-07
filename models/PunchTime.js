const mongoose = require('mongoose');

const punchTimeSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  punchInTime: { type: Date, required: true },
  punchOutTime: { type: Date },
  totalDuration: { type: Number } // in milliseconds, optional
}, { timestamps: true });

module.exports = mongoose.model('PunchTime', punchTimeSchema);