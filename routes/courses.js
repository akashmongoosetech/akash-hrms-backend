const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const courseController = require('../controllers/courseController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

const courseUpload = upload.fields([
  { name: 'courseVideo', maxCount: 1 },
  { name: 'thumbnailImage', maxCount: 1 },
]);

// Get all courses - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), courseController.getCourses);

// Get course by ID - Employee and above
router.get('/:id', authenticate, authorizeRoles('Employee'), courseController.getCourseById);

// Create new course - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), courseUpload, courseController.createCourse);

// Update course - Admin and SuperAdmin only
router.put('/:id', authenticate, authorizeRoles('Admin'), courseUpload, courseController.updateCourse);

// Delete course - SuperAdmin only
router.delete('/:id', authenticate, authorizeRoles('SuperAdmin'), courseController.deleteCourse);

// Enrollment routes - Employee and above
router.post('/:id/enroll', authenticate, authorizeRoles('Employee'), courseController.enrollInCourse);
router.post('/:id/unenroll', authenticate, authorizeRoles('Employee'), courseController.unenrollFromCourse);

module.exports = router;