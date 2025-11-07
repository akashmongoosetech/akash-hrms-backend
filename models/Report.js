const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  startTime: { type: String, required: true }, // HH:MM format
  breakDuration: { type: Number, default: 0 }, // in minutes
  endTime: { type: String, required: true }, // HH:MM format
  workingHours: { type: String, required: true }, // HH:MM format
  totalHours: { type: String, required: true }, // HH:MM format
  date: { type: String, required: true }, // YYYY-MM-DD
  note: { type: String, default: '' }, // Note field for admin/super admin
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);