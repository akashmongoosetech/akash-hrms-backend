const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all projects - Employee and above (Employees read-only)
router.get('/', authenticate, authorizeRoles('Employee'), projectController.getProjects);

// Get project by ID - Employee and above (Employees read-only)
router.get('/:id', authenticate, authorizeRoles('Employee'), projectController.getProjectById);

// Create new project - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), projectController.createProject);

// Update project - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), projectController.updateProject);

// Delete project - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), projectController.deleteProject);

module.exports = router;