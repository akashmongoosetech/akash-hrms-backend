const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all payments - Admin and SuperAdmin only
router.get('/', authenticate, authorizeRoles('Admin'), paymentController.getPayments);

// Get payment by ID - Admin and SuperAdmin only
router.get('/:id', authenticate, authorizeRoles('Admin'), paymentController.getPaymentById);

// Create new payment - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), paymentController.createPayment);

// Update payment - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), paymentController.updatePayment);

// Delete payment - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), paymentController.deletePayment);

module.exports = router;