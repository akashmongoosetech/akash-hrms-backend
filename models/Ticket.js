const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  title: { type: String, required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
  dueDate: { type: Date, required: true },
  description: { type: String, required: true },
  progress: [{
    date: { type: Date, default: Date.now },
    workingHours: { type: Number, min: 0 },
    progress: { type: Number, min: 0, max: 100 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  currentProgress: { type: Number, min: 0, max: 100, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);
