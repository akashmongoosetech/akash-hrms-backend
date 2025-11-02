const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all events - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), eventController.getEvents);

// Get event by ID - Employee and above
router.get('/:id', authenticate, authorizeRoles('Employee'), eventController.getEventById);

// Create new event - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), eventController.createEvent);

// Update event - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), eventController.updateEvent);

// Delete event - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), eventController.deleteEvent);

module.exports = router;