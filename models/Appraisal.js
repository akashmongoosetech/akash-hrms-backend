const mongoose = require('mongoose');

const appraisalSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  period: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }
  },
  overallRating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  categories: [{
    name: String,
    rating: { type: Number, min: 1, max: 5 },
    comments: String
  }],
  goals: [{
    title: String,
    description: String,
    status: {
      type: String,
      enum: ['Not Started', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Not Started'
    },
    targetDate: Date,
    progress: { type: Number, min: 0, max: 100, default: 0 }
  }],
  strengths: [String],
  areasForImprovement: [String],
  developmentPlan: String,
  comments: String,
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected'],
    default: 'Draft'
  },
  submittedAt: Date,
  reviewedAt: Date
}, {
  timestamps: true
});

module.exports = mongoose.model('Appraisal', appraisalSchema);