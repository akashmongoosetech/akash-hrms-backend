const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const attendanceUpload = require('../middleware/attendanceUpload');
const {
  punchIn,
  punchOut,
  getToday,
  getHistory,
  getMyAttendance,
  getCurrentLocation,
  getById,
  getSelfie,
} = require('../controllers/attendanceController');

const selfieUpload = attendanceUpload.single('selfie');

/**
 * Punch in with live selfie + GPS verification.
 * multipart/form-data: selfie (file), latitude, longitude, accuracy,
 * timestamp, address/city/state/area/postalCode, deviceInfo (JSON string).
 */
router.post('/punch-in', authenticate, selfieUpload, punchIn);

/** Punch out with a *fresh* live selfie + GPS capture. */
router.post('/punch-out', authenticate, selfieUpload, punchOut);

// Legacy aliases kept so older clients fail gracefully instead of 404ing.
router.post('/in', authenticate, selfieUpload, punchIn);
router.post('/out', authenticate, selfieUpload, punchOut);

// Read APIs. Static paths must be declared before '/:id'.
router.get('/today', authenticate, getToday);
router.get('/history', authenticate, getHistory);
router.get('/my-attendance', authenticate, getMyAttendance);
router.get('/current-location', authenticate, getCurrentLocation);

// Secure selfie streaming (owner or privileged reviewer only).
router.get('/:id/selfie/:type', authenticate, getSelfie);

// Record detail (owner or privileged reviewer only).
router.get('/:id', authenticate, getById);

module.exports = router;
