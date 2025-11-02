const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const authController = require('../controllers/authController');

const cpUpload = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'aadharCardFile', maxCount: 1 },
  { name: 'panCardFile', maxCount: 1 },
  { name: 'drivingLicenseFile', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
]);

router.post('/signup', cpUpload, authController.signup);
router.post('/login', authController.login);

module.exports = router;
