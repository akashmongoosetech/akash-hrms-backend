const express = require('express');
const router = express.Router();
const breakController = require('../controllers/breakController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Create a break record - Employee and above
router.post('/', authenticate, authorizeRoles('Employee'), breakController.createBreak);

// Create a break record by admin - Admin and SuperAdmin
router.post('/admin', authenticate, authorizeRoles('Admin', 'SuperAdmin'), breakController.createBreakByAdmin);

// Get all breaks - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), breakController.getBreaks);

// Get employees for dropdown - Admin and SuperAdmin
router.get('/employees', authenticate, authorizeRoles('Admin', 'SuperAdmin'), breakController.getEmployees);

// Get break duration for today - Employee and above
router.get('/duration', authenticate, authorizeRoles('Employee'), breakController.getBreakDuration);

module.exports = router;