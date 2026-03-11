const mongoose = require('mongoose');

const geoFenceAlertSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  geoFenceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GeoFence',
    required: true
  },
  geoFenceName: {
    type: String,
    required: true
  },
  alertType: {
    type: String,
    enum: ['ENTER', 'EXIT'],
    required: true
  },
  employeeLatitude: {
    type: Number,
    required: true
  },
  employeeLongitude: {
    type: Number,
    required: true
  },
  distance: {
    type: Number,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index for efficient queries
geoFenceAlertSchema.index({ employeeId: 1, createdAt: -1 });
geoFenceAlertSchema.index({ isRead: 1, isResolved: 1 });

module.exports = mongoose.model('GeoFenceAlert', geoFenceAlertSchema);
