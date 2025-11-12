const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNo: {
    type: String,
    required: true,
    unique: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    enum: ['Cash', 'Online', 'UPI', 'CARD', 'Crypto'],
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Hold'],
    default: 'Pending'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);