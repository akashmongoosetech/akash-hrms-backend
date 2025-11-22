const mongoose = require('mongoose');

const offboardingTaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dueDate: Date,
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: Date,
  notes: String
}, { timestamps: true });

const offboardingSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resignationDate: Date,
  lastWorkingDate: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    enum: ['Resignation', 'Termination', 'Retirement', 'Other'],
    required: true
  },
  reasonDetails: String,
  status: {
    type: String,
    enum: ['Initiated', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Initiated'
  },
  tasks: [offboardingTaskSchema],
  exitInterview: {
    scheduled: {
      type: Boolean,
      default: false
    },
    date: Date,
    interviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String,
    feedback: String
  },
  handover: {
    completed: {
      type: Boolean,
      default: false
    },
    notes: String,
    documents: [{
      name: String,
      url: String,
      uploadedAt: Date
    }]
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  hrContact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Offboarding', offboardingSchema);