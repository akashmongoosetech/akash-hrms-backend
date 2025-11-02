const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all holidays - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), holidayController.getHolidays);

// Get holiday by ID - Employee and above
router.get('/:id', authenticate, authorizeRoles('Employee'), holidayController.getHolidayById);

// Create new holiday - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), holidayController.createHoliday);

// Update holiday - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), holidayController.updateHoliday);

// Delete holiday - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), holidayController.deleteHoliday);

module.exports = router;