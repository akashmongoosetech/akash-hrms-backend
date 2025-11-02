const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all tickets - Admin and SuperAdmin only
router.get('/', authenticate, authorizeRoles('Admin'), ticketController.getTickets);

// Get ticket by ID - Admin and SuperAdmin only
router.get('/:id', authenticate, authorizeRoles('Admin'), ticketController.getTicketById);

// Create new ticket - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), ticketController.createTicket);

// Update ticket - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), ticketController.updateTicket);

// Delete ticket - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), ticketController.deleteTicket);

module.exports = router;