const mongoose = require('mongoose');

const geoFenceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  centerLatitude: {
    type: Number,
    required: true
  },
  centerLongitude: {
    type: Number,
    required: true
  },
  radius: {
    type: Number,
    required: true,
    min: 10 // Minimum radius in meters
  },
  description: {
    type: String,
    default: ''
  },
  color: {
    type: String,
    default: '#FF5722'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  alertOnEnter: {
    type: Boolean,
    default: true
  },
  alertOnExit: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for spatial queries
geoFenceSchema.index({ centerLatitude: 1, centerLongitude: 1 });

module.exports = mongoose.model('GeoFence', geoFenceSchema);
