const mongoose = require('mongoose');

const quizSubmissionSchema = new mongoose.Schema({
  employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  question_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  selected_option: { type: String, required: true, enum: ['A', 'B', 'C', 'D'] },
  submitted_on: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('QuizSubmission', quizSubmissionSchema);