const express = require('express');
const router = express.Router();
const todoController = require('../controllers/todoController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all todos - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), todoController.getTodos);

// Get todos for specific employee - Employee and above
router.get('/employee/:employeeId', authenticate, authorizeRoles('Employee'), todoController.getTodosByEmployee);

// Get todo by ID - Employee and above
router.get('/:id', authenticate, authorizeRoles('Employee'), todoController.getTodoById);

// Create new todo - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), todoController.createTodo);

// Update todo - Employee and above (employees can update their own todos)
router.put('/:id', authenticate, authorizeRoles('Employee'), todoController.updateTodo);

// Delete todo - Admin and SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('Admin'), todoController.deleteTodo);

module.exports = router;