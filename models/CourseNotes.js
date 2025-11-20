const mongoose = require('mongoose');

const courseNotesSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  notes: [{
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Compound index to ensure one notes record per user-course pair
courseNotesSchema.index({ user: 1, course: 1 }, { unique: true });

// Virtual for user details
courseNotesSchema.virtual('userDetails', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true
});

// Virtual for course details
courseNotesSchema.virtual('courseDetails', {
  ref: 'Course',
  localField: 'course',
  foreignField: '_id',
  justOne: true
});

// Ensure virtual fields are serialized
courseNotesSchema.set('toJSON', { virtuals: true });
courseNotesSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CourseNotes', courseNotesSchema);