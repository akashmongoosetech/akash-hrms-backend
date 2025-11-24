const Question = require('../models/Question');
const QuizAssignment = require('../models/QuizAssignment');
const QuizSubmission = require('../models/QuizSubmission');
const QuizScore = require('../models/QuizScore');
const User = require('../models/User');

// Admin: Create Question
const createQuestion = async (req, res) => {
  try {
    const { question_text, option_a, option_b, option_c, option_d, correct_option, difficulty, category } = req.body;

    if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const question = new Question({
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      difficulty: difficulty || 'Medium',
      category: category || ''
    });

    await question.save();
    res.status(201).json({ message: 'Question created successfully', question });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Get All Questions
const getQuestions = async (req, res) => {
  try {
    const questions = await Question.find().sort({ createdAt: -1 });
    res.json(questions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Update Question
const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const question = await Question.findByIdAndUpdate(id, updates, { new: true });
    if (!question) return res.status(404).json({ message: 'Question not found' });

    res.json({ message: 'Question updated successfully', question });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Delete Question
const deleteQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByIdAndDelete(id);
    if (!question) return res.status(404).json({ message: 'Question not found' });

    res.json({ message: 'Question deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Assign Quiz to Employee
const assignQuiz = async (req, res) => {
  try {
    const { employee_id, questions, due_date } = req.body;

    if (!employee_id || !questions || questions.length === 0) {
      return res.status(400).json({ message: 'Employee ID and questions are required' });
    }

    // Check if employee exists
    const employee = await User.findById(employee_id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Check if questions exist
    const questionIds = questions.map(q => q.id || q);
    const existingQuestions = await Question.find({ _id: { $in: questionIds } });
    if (existingQuestions.length !== questionIds.length) {
      return res.status(400).json({ message: 'Some questions not found' });
    }

    // Create assignments
    const assignments = questionIds.map(questionId => ({
      employee_id,
      question_id: questionId,
      due_date: due_date ? new Date(due_date) : null
    }));

    await QuizAssignment.insertMany(assignments);

    res.status(201).json({ message: 'Quiz assigned successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Employee: Get Assigned Quizzes
const getAssignedQuizzes = async (req, res) => {
  try {
    const employee_id = req.user._id;

    const assignments = await QuizAssignment.find({ employee_id })
      .populate('question_id')
      .sort({ assigned_on: -1 });

    // Get submissions to check which are completed
    const submissions = await QuizSubmission.find({ employee_id });
    const submittedQuestionIds = submissions.map(s => s.question_id.toString());

    const quizzes = assignments.map(assignment => ({
      ...assignment.toObject(),
      completed: submittedQuestionIds.includes(assignment.question_id._id.toString())
    }));

    res.json(quizzes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Employee: Submit Quiz Answers
const submitQuiz = async (req, res) => {
  try {
    const { answers } = req.body;
    const employee_id = req.user._id;

    if (!answers || answers.length === 0) {
      return res.status(400).json({ message: 'Answers are required' });
    }

    // Validate answers and check assignments
    for (const answer of answers) {
      const { question_id, selected_option } = answer;

      // Check if question exists
      const question = await Question.findById(question_id);
      if (!question) return res.status(400).json({ message: `Question ${question_id} not found` });

      // Check if assigned to this employee
      const assignment = await QuizAssignment.findOne({ employee_id, question_id });
      if (!assignment) return res.status(403).json({ message: `Question ${question_id} not assigned to you` });

      // Check if already submitted
      const existingSubmission = await QuizSubmission.findOne({ employee_id, question_id });
      if (existingSubmission) return res.status(400).json({ message: `Question ${question_id} already submitted` });
    }

    // Save submissions
    const submissions = answers.map(answer => ({
      employee_id,
      question_id: answer.question_id,
      selected_option: answer.selected_option
    }));

    await QuizSubmission.insertMany(submissions);

    // Calculate score
    let correctCount = 0;
    for (const answer of answers) {
      const question = await Question.findById(answer.question_id);
      if (question.correct_option === answer.selected_option) {
        correctCount++;
      }
    }

    // Save score
    const score = new QuizScore({
      employee_id,
      score: correctCount,
      total_questions: answers.length
    });
    await score.save();

    res.json({
      message: 'Quiz submitted successfully',
      score: correctCount,
      total: answers.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get Quiz Scores (for employee or admin)
const getQuizScores = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'Employee') {
      query.employee_id = req.user._id;
    } else if (req.params.employee_id) {
      query.employee_id = req.params.employee_id;
    }

    const scores = await QuizScore.find(query)
      .populate('employee_id', 'firstName lastName email')
      .sort({ submitted_on: -1 });

    res.json(scores);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createQuestion,
  getQuestions,
  updateQuestion,
  deleteQuestion,
  assignQuiz,
  getAssignedQuizzes,
  submitQuiz,
  getQuizScores
};