const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { uploadImage } = require('../controllers/uploadController');
const authenticate = require('../middleware/auth');

// Upload image route (protected)
router.post('/image', authenticate, upload.single('upload'), uploadImage);

module.exports = router;