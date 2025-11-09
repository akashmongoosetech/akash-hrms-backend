const express = require('express');
const router = express.Router();
const alternateSaturdayController = require('../controllers/alternateSaturdayController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all alternate Saturdays - Admin and above
router.get('/', authenticate, authorizeRoles('Admin'), alternateSaturdayController.getAlternateSaturdays);

// Save alternate Saturdays (bulk) - Admin and above
router.post('/', authenticate, authorizeRoles('Admin'), alternateSaturdayController.saveAlternateSaturdays);

// Get alternate Saturday for specific month/year - Admin and above
router.get('/:month/:year', authenticate, authorizeRoles('Admin'), alternateSaturdayController.getAlternateSaturday);

// Delete alternate Saturday for specific month/year - Admin and above
router.delete('/:month/:year', authenticate, authorizeRoles('Admin'), alternateSaturdayController.deleteAlternateSaturday);

module.exports = router;