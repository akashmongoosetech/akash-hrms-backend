const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all invoices - Admin and SuperAdmin only
router.get('/', authenticate, authorizeRoles('Admin'), invoiceController.getInvoices);

// Get invoice by ID - Admin and SuperAdmin only
router.get('/:id', authenticate, authorizeRoles('Admin'), invoiceController.getInvoiceById);

// Create new invoice - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), invoiceController.createInvoice);

// Update invoice - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), invoiceController.updateInvoice);

// Delete invoice - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), invoiceController.deleteInvoice);

module.exports = router;