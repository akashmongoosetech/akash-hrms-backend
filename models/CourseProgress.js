const mongoose = require('mongoose');

const courseProgressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  progress: { type: Number, min: 0, max: 100, default: 0 }, // Percentage completed
  watchedTime: { type: Number, default: 0 }, // Time watched in seconds
  totalDuration: { type: Number, default: 0 }, // Total video duration in seconds
  completed: { type: Boolean, default: false },
  lastWatchedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Compound index to ensure one progress record per user-course pair
courseProgressSchema.index({ user: 1, course: 1 }, { unique: true });

// Virtual for user details
courseProgressSchema.virtual('userDetails', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true
});

// Virtual for course details
courseProgressSchema.virtual('courseDetails', {
  ref: 'Course',
  localField: 'course',
  foreignField: '_id',
  justOne: true
});

// Ensure virtual fields are serialized
courseProgressSchema.set('toJSON', { virtuals: true });
courseProgressSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CourseProgress', courseProgressSchema);