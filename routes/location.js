const express = require('express');
const router = express.Router();
const {
  updateLocation,
  getLiveLocations,
  getLocationHistory,
  getCurrentLocation,
  getMyLocation,
  getLocationStatus
} = require('../controllers/locationController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Employee routes - require authentication
router.post('/update', authenticate, updateLocation);
router.get('/my-location', authenticate, getMyLocation);

// Admin routes - require authentication and admin role
router.get('/live', authenticate, authorizeRoles('Admin'), getLiveLocations);
router.get('/history/:employeeId', authenticate, authorizeRoles('Admin'), getLocationHistory);
router.get('/current/:employeeId', authenticate, authorizeRoles('Admin'), getCurrentLocation);
router.get('/status/:employeeId', authenticate, authorizeRoles('Admin'), getLocationStatus);

module.exports = router;
