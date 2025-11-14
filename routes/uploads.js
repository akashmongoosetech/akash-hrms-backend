const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { uploadImage, uploadProfilePicture, getGalleryPictures, getAllGalleryPictures, deleteProfilePicture } = require('../controllers/uploadController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Upload image route (protected)
router.post('/image', authenticate, upload.single('upload'), uploadImage);

// Upload profile picture
router.post('/profile-picture/:userId?', authenticate, upload.single('profilePicture'), uploadProfilePicture);

// Get gallery pictures for a user
router.get('/gallery/:userId?', authenticate, getGalleryPictures);

// Get all gallery pictures (admin only)
router.get('/gallery-all', authenticate, authorizeRoles('Admin'), getAllGalleryPictures);

// Delete profile picture
router.delete('/profile-picture/:userId/:pictureUrl', authenticate, deleteProfilePicture);

module.exports = router;