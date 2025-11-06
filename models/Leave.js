const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  leaveType: { type: String, enum: ['Vacation', 'Sick', 'Personal'], required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  comments: { type: String },
  daysRequested: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Leave', leaveSchema);