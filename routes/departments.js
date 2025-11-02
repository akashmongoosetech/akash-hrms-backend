const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all departments - Admin and SuperAdmin only
router.get('/', authenticate, authorizeRoles('Admin'), departmentController.getDepartments);

// Get department by ID - Admin and SuperAdmin only
router.get('/:id', authenticate, authorizeRoles('Admin'), departmentController.getDepartmentById);

// Create new department - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), departmentController.createDepartment);

// Update department - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), departmentController.updateDepartment);

// Delete department - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), departmentController.deleteDepartment);

module.exports = router;