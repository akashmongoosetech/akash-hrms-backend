const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const userController = require('../controllers/userController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

const cpUpload = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'aadharCardFile', maxCount: 1 },
  { name: 'panCardFile', maxCount: 1 },
  { name: 'drivingLicenseFile', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
]);

// Get all users - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), userController.getUsers);

// Get user by ID - Employee and above
router.get('/:id', authenticate, authorizeRoles('Employee'), userController.getUserById);

// Create new user - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), cpUpload, userController.createUser);

// Update user - Employee (own profile) or Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Employee'), cpUpload, userController.updateUser);

// Delete user - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), userController.deleteUser);

// Push notification subscription routes
router.post('/subscribe-push', authenticate, userController.subscribePush);
router.post('/unsubscribe-push', authenticate, userController.unsubscribePush);

module.exports = router;