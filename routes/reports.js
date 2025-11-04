const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Create a report - Employee and above
router.post('/', authenticate, authorizeRoles('Employee'), reportController.createReport);

// Get all reports - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), reportController.getReports);

// Get a specific report by ID - Employee and above (with permission check)
router.get('/:id', authenticate, authorizeRoles('Employee'), reportController.getReportById);

// Update a report - Employee and above (with permission check)
router.put('/:id', authenticate, authorizeRoles('Employee'), reportController.updateReport);

// Delete a report - Employee and above (with permission check)
router.delete('/:id', authenticate, authorizeRoles('Employee'), reportController.deleteReport);

module.exports = router;