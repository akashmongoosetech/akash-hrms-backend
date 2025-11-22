const express = require('express');
const router = express.Router();
const offboardingController = require('../controllers/offboardingController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// All routes require authentication
router.use(auth);

// Get all offboardings
router.get('/', authorize(['Admin', 'HR', 'Manager']), offboardingController.getOffboardings);

// Get single offboarding
router.get('/:id', authorize(['Admin', 'HR', 'Manager', 'Employee']), offboardingController.getOffboardingById);

// Create new offboarding
router.post('/', authorize(['Admin', 'HR']), offboardingController.createOffboarding);

// Update offboarding
router.put('/:id', authorize(['Admin', 'HR', 'Manager']), offboardingController.updateOffboarding);

// Delete offboarding
router.delete('/:id', authorize(['Admin', 'HR']), offboardingController.deleteOffboarding);

// Update task completion
router.put('/:id/tasks/:taskId', authorize(['Admin', 'HR', 'Manager', 'Employee']), offboardingController.updateTaskCompletion);

// Add task
router.post('/:id/tasks', authorize(['Admin', 'HR', 'Manager']), offboardingController.addTask);

module.exports = router;