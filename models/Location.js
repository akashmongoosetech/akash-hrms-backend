const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  accuracy: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  isLatest: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for efficient queries
locationSchema.index({ employeeId: 1, timestamp: -1 });
locationSchema.index({ employeeId: 1, isLatest: -1 });

// Static method to update latest location for an employee
locationSchema.statics.updateLatestLocation = async function(employeeId, locationData) {
  // Remove previous latest flag
  await this.updateMany(
    { employeeId, isLatest: true },
    { isLatest: false }
  );
  
  // Create new location
  const location = await this.create({
    ...locationData,
    employeeId,
    isLatest: true,
    timestamp: locationData.timestamp || new Date()
  });
  
  return location;
};

module.exports = mongoose.model('Location', locationSchema);
