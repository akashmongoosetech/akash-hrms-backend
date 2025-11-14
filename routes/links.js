const express = require('express');
const router = express.Router();
const linkController = require('../controllers/linkController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const upload = require('../middleware/upload');

// Get all links - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), linkController.getLinks);

// Get link by ID - Employee and above
router.get('/:id', authenticate, authorizeRoles('Employee'), linkController.getLinkById);

// Create new link - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), upload.single('file'), linkController.createLink);

// Update link - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), upload.single('file'), linkController.updateLink);

// Delete link - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), linkController.deleteLink);

module.exports = router;