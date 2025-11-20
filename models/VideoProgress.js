const mongoose = require('mongoose');

const videoProgressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  moduleId: { type: String, required: true }, // Module ID within the course
  videoId: { type: String, required: true }, // Video ID within the module
  progress: { type: Number, min: 0, max: 100, default: 0 }, // Percentage completed for this video
  watchedTime: { type: Number, default: 0 }, // Time watched in seconds for this video
  totalDuration: { type: Number, default: 0 }, // Total video duration in seconds
  completed: { type: Boolean, default: false },
  lastWatchedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Compound index to ensure one progress record per user-course-module-video combination
videoProgressSchema.index({ user: 1, course: 1, moduleId: 1, videoId: 1 }, { unique: true });

// Virtual for user details
videoProgressSchema.virtual('userDetails', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true
});

// Virtual for course details
videoProgressSchema.virtual('courseDetails', {
  ref: 'Course',
  localField: 'course',
  foreignField: '_id',
  justOne: true
});

// Ensure virtual fields are serialized
videoProgressSchema.set('toJSON', { virtuals: true });
videoProgressSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('VideoProgress', videoProgressSchema);