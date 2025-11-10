const mongoose = require('mongoose');

const saturdaySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  isWeekend: { type: Boolean, default: false },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
}, { timestamps: true });

// Index for efficient querying by year and month
saturdaySchema.index({ year: 1, month: 1 });

module.exports = mongoose.model('Saturday', saturdaySchema);