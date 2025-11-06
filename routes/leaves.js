const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Request leave - Employee and above
router.post('/', authenticate, authorizeRoles('Employee'), leaveController.requestLeave);

// Get leaves - Employee and above (employees see their own, admins see all)
router.get('/', authenticate, authorizeRoles('Employee'), leaveController.getLeaves);

// Update leave status (Approve/Reject) - Admin and SuperAdmin only
router.put('/:id/status', authenticate, authorizeRoles('Admin'), leaveController.updateLeaveStatus);

// Delete leave - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), leaveController.deleteLeave);

module.exports = router;