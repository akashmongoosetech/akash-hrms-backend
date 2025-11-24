const mongoose = require('mongoose');

const quizAssignmentSchema = new mongoose.Schema({
  employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  question_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  assigned_on: { type: Date, default: Date.now },
  due_date: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('QuizAssignment', quizAssignmentSchema);