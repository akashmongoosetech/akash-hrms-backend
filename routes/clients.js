const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const clientController = require('../controllers/clientController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

const cpUpload = upload.fields([
  { name: 'profile', maxCount: 1 },
]);

// Get all clients - Admin and SuperAdmin only
router.get('/', authenticate, authorizeRoles('Admin'), clientController.getClients);

// Get client by ID - Admin and SuperAdmin only
router.get('/:id', authenticate, authorizeRoles('Admin'), clientController.getClientById);

// Create new client - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), cpUpload, clientController.createClient);

// Update client - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), cpUpload, clientController.updateClient);

// Delete client - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), clientController.deleteClient);

module.exports = router;