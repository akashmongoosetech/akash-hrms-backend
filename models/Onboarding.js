const mongoose = require('mongoose');

const onboardingTaskSchema = new mongoose.Schema({
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

const onboardingSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: Date,
  status: {
    type: String,
    enum: ['Not Started', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Not Started'
  },
  tasks: [onboardingTaskSchema],
  welcomeMessage: String,
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  hrContact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  documents: [{
    name: String,
    url: String,
    required: {
      type: Boolean,
      default: false
    },
    uploaded: {
      type: Boolean,
      default: false
    },
    uploadedAt: Date
  }],
  notes: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Onboarding', onboardingSchema);