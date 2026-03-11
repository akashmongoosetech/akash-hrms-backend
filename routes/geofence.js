const express = require('express');
const router = express.Router();
const {
  createGeoFence,
  getGeoFences,
  getGeoFence,
  updateGeoFence,
  deleteGeoFence,
  getAlerts,
  markAlertAsRead,
  resolveAlert,
  getUnreadAlertCount
} = require('../controllers/geofenceController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Geofence CRUD routes (Admin only)
router.post('/create', authenticate, authorizeRoles('Admin'), createGeoFence);
router.get('/', authenticate, authorizeRoles('Admin'), getGeoFences);
router.get('/:id', authenticate, authorizeRoles('Admin'), getGeoFence);
router.put('/:id', authenticate, authorizeRoles('Admin'), updateGeoFence);
router.delete('/:id', authenticate, authorizeRoles('Admin'), deleteGeoFence);

// Alert routes (Admin only)
router.get('/alerts', authenticate, authorizeRoles('Admin'), getAlerts);
router.get('/alerts/count', authenticate, authorizeRoles('Admin'), getUnreadAlertCount);
router.put('/alerts/:id/read', authenticate, authorizeRoles('Admin'), markAlertAsRead);
router.put('/alerts/:id/resolve', authenticate, authorizeRoles('Admin'), resolveAlert);

module.exports = router;
