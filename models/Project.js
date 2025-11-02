const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  technology: { type: String, required: true }, // comma-separated
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  teamMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  startDate: { type: Date, required: true },
  status: { type: String, enum: ['Active', 'Completed', 'On Hold'], default: 'Active' },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);