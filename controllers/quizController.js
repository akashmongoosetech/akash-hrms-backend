const Question = require('../models/Question');
const QuizAssignment = require('../models/QuizAssignment');
const QuizSubmission = require('../models/QuizSubmission');
const QuizScore = require('../models/QuizScore');
const User = require('../models/User');
const { notifyAssignedEmployee } = require('./notificationController');

const quizLabel = (modules) => {
  if (Array.isArray(modules) && modules.length) return modules.join(', ');
  if (typeof modules === 'string' && modules.trim()) return modules.trim();
  return 'Quiz';
};

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
    const { employee_id, modules, due_date } = req.body;

    if (!employee_id || !modules || modules.length === 0) {
      return res.status(400).json({ message: 'Employee ID and modules are required' });
    }

    // Check if employee exists
    const employee = await User.findById(employee_id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Get all questions for the selected modules
    const questions = await Question.find({ category: { $in: modules } });
    if (questions.length === 0) {
      return res.status(400).json({ message: 'No questions found for the selected modules' });
    }

    // Create assignments only for questions that are not already assigned to
    // this employee. Repeating the same request must not duplicate assignments
    // or notifications.
    const questionIds = questions.map(question => question._id);
    const existingAssignments = await QuizAssignment.find({
      employee_id,
      question_id: { $in: questionIds }
    }).select('question_id').lean();
    const existingQuestionIds = new Set(
      existingAssignments.map(assignment => String(assignment.question_id))
    );

    const newAssignments = questions
      .filter(question => !existingQuestionIds.has(String(question._id)))
      .map(question => ({
        employee_id,
        question_id: question._id,
        due_date: due_date ? new Date(due_date) : null
      }));

    if (!newAssignments.length) {
      return res.status(409).json({ message: 'This quiz is already assigned to the employee' });
    }

    await QuizAssignment.insertMany(newAssignments);

    // Notify the assigned employee. Recipient selection stays on the server
    // and the actor is excluded by the notification service.
    const assignedEmployee = await User.findById(employee_id).select('_id firstName lastName role').lean();
    const quizName = quizLabel(modules);

    if (assignedEmployee) {
      await notifyAssignedEmployee({
        employeeId: employee_id,
        actor: req.user,
        type: 'quiz_assigned',
        title: 'New Quiz Assigned',
        message: `${req.user.firstName} ${req.user.lastName} has assigned you a new quiz: ${quizName}.`,
        data: {
          action: 'assigned',
          employeeId: employee_id,
          employeeName: `${assignedEmployee.firstName} ${assignedEmployee.lastName}`,
          quizName,
          modules,
          quizCount: newAssignments.length,
          dueDate: due_date,
          actorId: req.user._id,
          actorName: `${req.user.firstName} ${req.user.lastName}`,
          link: '/quiz',
        },
        dueDate,
        io: req.app.get('io'),
        pushTitle: '📝 New Quiz Assigned',
        pushUrl: '/quiz',
      });
    }

    res.status(201).json({ message: 'Quiz assigned successfully', assignedCount: newAssignments.length });
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

// Admin: Get All Quiz Assignments
const getAllAssignments = async (req, res) => {
  try {
    const assignments = await QuizAssignment.find()
      .populate('employee_id', 'firstName lastName email')
      .populate('question_id', 'question_text difficulty category')
      .sort({ assigned_on: -1 });

    // Get all submissions to check which are completed
    const submissions = await QuizSubmission.find();
    const submittedMap = new Map();
    submissions.forEach(sub => {
      submittedMap.set(`${sub.employee_id}-${sub.question_id}`, true);
    });

    const assignmentsWithStatus = assignments.map(assignment => ({
      ...assignment.toObject(),
      completed: submittedMap.has(`${assignment.employee_id._id}-${assignment.question_id._id}`)
    }));

    res.json(assignmentsWithStatus);
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

// Admin: Update an existing assignment (due date)
const updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { due_date } = req.body;

    const assignment = await QuizAssignment.findById(id)
      .populate('question_id', 'category')
      .populate('employee_id', 'firstName lastName');
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    assignment.due_date = due_date ? new Date(due_date) : null;
    await assignment.save();

    // Only the assigned employee hears about the change.
    const quizName = quizLabel(assignment.question_id?.category);
    await notifyAssignedEmployee({
      employeeId: assignment.employee_id?._id || assignment.employee_id,
      actor: req.user,
      type: 'quiz_updated',
      title: 'Quiz Updated',
      message: `${req.user.firstName} ${req.user.lastName} has updated your assigned quiz: ${quizName}.`,
      data: {
        action: 'updated',
        assignmentId: assignment._id,
        employeeId: assignment.employee_id?._id || assignment.employee_id,
        quizName,
        dueDate: assignment.due_date,
        actorId: req.user._id,
        actorName: `${req.user.firstName} ${req.user.lastName}`,
        link: '/quiz',
      },
      dueDate: assignment.due_date,
      entityType: 'QuizAssignment',
      entityId: assignment._id,
      io: req.app.get('io'),
      pushTitle: '📝 Quiz Updated',
      pushUrl: '/quiz',
    });

    res.json({ message: 'Assignment updated successfully', assignment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Delete an assignment
const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    const assignment = await QuizAssignment.findById(id)
      .populate('question_id', 'category');
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    const employeeId = assignment.employee_id;
    const quizName = quizLabel(assignment.question_id?.category);

    await QuizAssignment.findByIdAndDelete(id);

    await notifyAssignedEmployee({
      employeeId,
      actor: req.user,
      type: 'quiz_deleted',
      title: 'Quiz Deleted',
      message: `${req.user.firstName} ${req.user.lastName} has deleted your assigned quiz: ${quizName}.`,
      data: {
        action: 'deleted',
        assignmentId: assignment._id,
        employeeId,
        quizName,
        actorId: req.user._id,
        actorName: `${req.user.firstName} ${req.user.lastName}`,
        link: '/quiz',
      },
      entityType: 'QuizAssignment',
      entityId: assignment._id,
      io: req.app.get('io'),
      pushTitle: '🗑️ Quiz Removed',
      pushUrl: '/quiz',
    });

    res.json({ message: 'Assignment deleted successfully' });
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
  updateAssignment,
  deleteAssignment,
  getAssignedQuizzes,
  submitQuiz,
  getAllAssignments,
  getQuizScores
};