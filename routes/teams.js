const express = require('express');
const router = express.Router();
const { getTeams, createTeam, deleteTeam } = require('../controllers/teamController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// All team routes require authentication
router.use(authenticate);

// Get all teams
router.get('/', getTeams);

// Create a new team (Admin only)
router.post('/', authorizeRoles('Admin'), createTeam);

// Delete a team (Admin only)
router.delete('/:id', authorizeRoles('Admin'), deleteTeam);

module.exports = router;