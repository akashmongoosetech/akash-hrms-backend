const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboardingController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// All routes require authentication
router.use(auth);

// Get all onboardings
router.get('/', authorize(['Admin', 'HR', 'Manager']), onboardingController.getOnboardings);

// Get single onboarding
router.get('/:id', authorize(['Admin', 'HR', 'Manager', 'Employee']), onboardingController.getOnboardingById);

// Create new onboarding
router.post('/', authorize(['Admin', 'HR']), onboardingController.createOnboarding);

// Update onboarding
router.put('/:id', authorize(['Admin', 'HR', 'Manager']), onboardingController.updateOnboarding);

// Delete onboarding
router.delete('/:id', authorize(['Admin', 'HR']), onboardingController.deleteOnboarding);

// Update task completion
router.put('/:id/tasks/:taskId', authorize(['Admin', 'HR', 'Manager', 'Employee']), onboardingController.updateTaskCompletion);

// Add task
router.post('/:id/tasks', authorize(['Admin', 'HR', 'Manager']), onboardingController.addTask);

module.exports = router;