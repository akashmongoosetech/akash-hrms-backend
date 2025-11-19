const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Get all categories - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), categoryController.getCategories);

// Get category by ID - Employee and above
router.get('/:id', authenticate, authorizeRoles('Employee'), categoryController.getCategoryById);

// Create new category - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), categoryController.createCategory);

// Update category - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), categoryController.updateCategory);

// Delete category - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), categoryController.deleteCategory);

module.exports = router;