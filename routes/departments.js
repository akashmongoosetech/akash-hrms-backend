const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all departments - Admin, SuperAdmin, and Employee
router.get('/', authenticate, authorizeRoles('Employee'), departmentController.getDepartments);

// Get department by ID - Admin and SuperAdmin only
router.get('/:id', authenticate, authorizeRoles('Admin', 'Employee'), departmentController.getDepartmentById);

// Create new department - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin', 'Employee'), departmentController.createDepartment);

// Update department - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin', 'Employee'), departmentController.updateDepartment);

// Delete department - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin', 'Employee'), departmentController.deleteDepartment);

module.exports = router;