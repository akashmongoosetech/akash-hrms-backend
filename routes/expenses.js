const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all expenses - Admin and SuperAdmin only
router.get('/', authenticate, authorizeRoles('Admin'), expenseController.getExpenses);

// Get expense by ID - Admin and SuperAdmin only
router.get('/:id', authenticate, authorizeRoles('Admin'), expenseController.getExpenseById);

// Create new expense - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), expenseController.createExpense);

// Update expense - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), expenseController.updateExpense);

// Delete expense - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), expenseController.deleteExpense);

module.exports = router;