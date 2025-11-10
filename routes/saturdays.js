const express = require('express');
const router = express.Router();
const saturdayController = require('../controllers/saturdayController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get Saturdays for a specific year and month - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), saturdayController.getSaturdays);

// Get all Saturdays - Employee and above
router.get('/all', authenticate, authorizeRoles('Employee'), saturdayController.getAllSaturdays);

// Create or update Saturday setting - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), saturdayController.createOrUpdateSaturday);

// Update Saturday setting - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), saturdayController.updateSaturday);

// Delete Saturday setting - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), saturdayController.deleteSaturday);

// Bulk update Saturdays for a month - Admin and SuperAdmin only
router.post('/bulk-update', authenticate, authorizeRoles('Admin'), saturdayController.bulkUpdateSaturdays);

module.exports = router;