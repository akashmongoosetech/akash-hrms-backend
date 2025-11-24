const mongoose = require('mongoose');

const quizScoreSchema = new mongoose.Schema({
  employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  score: { type: Number, required: true },
  total_questions: { type: Number, required: true },
  submitted_on: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('QuizScore', quizScoreSchema);