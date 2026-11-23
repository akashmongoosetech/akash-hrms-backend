const express = require('express');
const router = express.Router();
const {
  updateLocation,
  getLiveLocations,
  getLocationHistory,
  getCurrentLocation,
  getMyLocation,
  getLocationStatus,
  getEmployeesForTracking
} = require('../controllers/locationController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Employee routes - require authentication
router.post('/update', authenticate, updateLocation);
router.get('/my-location', authenticate, getMyLocation);

// Admin routes - require authentication and admin or superadmin role
router.get('/live', authenticate, authorizeRoles(['Admin', 'SuperAdmin']), getLiveLocations);
router.get('/history/:employeeId', authenticate, authorizeRoles(['Admin', 'SuperAdmin']), getLocationHistory);
router.get('/current/:employeeId', authenticate, authorizeRoles(['Admin', 'SuperAdmin']), getCurrentLocation);
router.get('/status/:employeeId', authenticate, authorizeRoles(['Admin', 'SuperAdmin']), getLocationStatus);

// Employee list for tracking dropdown - Admin and SuperAdmin
router.get('/employees', authenticate, authorizeRoles(['Admin', 'SuperAdmin']), getEmployeesForTracking);

module.exports = router;
