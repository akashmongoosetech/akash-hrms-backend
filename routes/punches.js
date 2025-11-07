const express = require('express');
const router = express.Router();
const punchController = require('../controllers/punchController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Punch in - Employee and above
router.post('/in', authenticate, authorizeRoles('Employee'), punchController.punchIn);

// Punch out - Employee and above
router.post('/out', authenticate, authorizeRoles('Employee'), punchController.punchOut);

// Get punch times - Employee and above (employees see their own, admins see all)
router.get('/', authenticate, authorizeRoles('Employee'), punchController.getPunchTimes);

// Get current punch status - Employee and above
router.get('/status', authenticate, authorizeRoles('Employee'), punchController.getCurrentPunchStatus);

module.exports = router;