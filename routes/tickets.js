const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all tickets - Admin, SuperAdmin, and Employee (filtered)
router.get('/', authenticate, authorizeRoles('Employee'), ticketController.getTickets);

// Get ticket by ID - Admin and Employee (with ownership check)
router.get('/:id', authenticate, authorizeRoles('Employee'), ticketController.getTicketById);

// Create new ticket - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), ticketController.createTicket);

// Update ticket - Admin and Employee (with ownership check)
router.put('/:id', authenticate, authorizeRoles('Employee'), ticketController.updateTicket);

// Delete ticket - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), ticketController.deleteTicket);

module.exports = router;