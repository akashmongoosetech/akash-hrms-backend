const express = require('express');
const router = express.Router();
const punchController = require('../controllers/punchController');
const attendanceController = require('../controllers/attendanceController');
const attendanceUpload = require('../middleware/attendanceUpload');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

const selfieUpload = attendanceUpload.single('selfie');

// Punch in - Employee and above.
// Delegates to the attendance controller so there is a single write path that
// always requires a live selfie, fresh GPS and updates the legacy PunchTime
// collection for older screens.
router.post('/in', authenticate, authorizeRoles('Employee'), selfieUpload, attendanceController.punchIn);

// Punch out - Employee and above. Also requires a fresh selfie + GPS.
router.post('/out', authenticate, authorizeRoles('Employee'), selfieUpload, attendanceController.punchOut);

// Get punch times - Employee and above (employees see their own, admins see all)
router.get('/', authenticate, authorizeRoles('Employee'), punchController.getPunchTimes);

// Get current punch status - Employee and above
router.get('/status', authenticate, authorizeRoles('Employee'), punchController.getCurrentPunchStatus);

module.exports = router;