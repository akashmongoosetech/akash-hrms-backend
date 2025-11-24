const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Admin routes
router.post('/admin/question', authenticate, authorizeRoles('Admin'), quizController.createQuestion);
router.get('/admin/questions', authenticate, authorizeRoles('Admin'), quizController.getQuestions);
router.put('/admin/question/:id', authenticate, authorizeRoles('Admin'), quizController.updateQuestion);
router.delete('/admin/question/:id', authenticate, authorizeRoles('Admin'), quizController.deleteQuestion);
router.post('/admin/assign-quiz', authenticate, authorizeRoles('Admin'), quizController.assignQuiz);

// Employee routes
router.get('/employee/quizzes', authenticate, authorizeRoles('Employee'), quizController.getAssignedQuizzes);
router.post('/employee/submit-quiz', authenticate, authorizeRoles('Employee'), quizController.submitQuiz);

// Scores (Admin can see all, Employee can see own)
router.get('/scores', authenticate, quizController.getQuizScores);
router.get('/scores/:employee_id', authenticate, authorizeRoles('Admin'), quizController.getQuizScores);

module.exports = router;