const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  expenseId: {
    type: String,
    required: true,
    unique: true
  },
  item: {
    type: String,
    required: true
  },
  orderBy: {
    type: String,
    required: true
  },
  from: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Approved', 'Pending', 'Reject'],
    default: 'Pending'
  },
  type: {
    type: String,
    enum: ['Online', 'UPI', 'Cash', 'Card', 'Net Banking'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);