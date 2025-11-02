const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  title: { type: String, required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], required: true },
  dueDate: { type: Date, required: true },
  description: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);