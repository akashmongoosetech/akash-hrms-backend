const mongoose = require('mongoose');

const deletedEmployeeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  originalUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: { type: String, enum: ['Employee', 'Admin', 'SuperAdmin'], default: 'Employee' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  deletionDate: { type: Date, default: Date.now },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('DeletedEmployee', deletedEmployeeSchema);