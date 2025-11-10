const mongoose = require('mongoose');

const alternateSaturdaySchema = new mongoose.Schema({
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true,
    min: 2020,
    max: 2030
  },
  workingSaturdays: {
    type: [Number],
    required: true,
    default: [],
    validate: {
      validator: function(array) {
        // Check if all Saturday numbers are valid for the month
        const date = new Date(this.year, this.month - 1, 1);
        const lastDay = new Date(this.year, this.month, 0);
        let saturdayCount = 0;

        for (let d = new Date(date); d <= lastDay; d.setDate(d.getDate() + 1)) {
          if (d.getDay() === 6) { // Saturday
            saturdayCount++;
          }
        }

        // All values should be between 1 and saturdayCount, and unique
        return array.every(num => num >= 1 && num <= saturdayCount) &&
               array.length === new Set(array).size;
      },
      message: 'Invalid Saturday numbers for this month'
    }
  }
}, {
  timestamps: true
});

// Compound index to ensure unique month-year combination
alternateSaturdaySchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('AlternateSaturday', alternateSaturdaySchema);