const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const courseController = require('../controllers/courseController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

const courseUpload = upload.fields([
  { name: 'thumbnailImage', maxCount: 1 },
]);

const videoUpload = upload.single('video');

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

// Progress routes - Employee and above
router.get('/:id/progress', authenticate, authorizeRoles('Employee'), courseController.getCourseProgress);
router.put('/:id/modules/:moduleId/videos/:videoId/progress', authenticate, authorizeRoles('Employee'), courseController.updateVideoProgress);
router.get('/:id/modules/:moduleId/videos/:videoId/progress', authenticate, authorizeRoles('Employee'), courseController.getVideoProgress);

// Certificate routes - Employee and above
router.get('/:id/certificate', authenticate, authorizeRoles('Employee'), courseController.generateCertificate);
router.post('/verify-certificate', authenticate, authorizeRoles('Admin'), courseController.verifyCertificate);

// Notes routes - Employee and above
router.get('/:id/notes', authenticate, authorizeRoles('Employee'), courseController.getCourseNotes);
router.post('/:id/notes', authenticate, authorizeRoles('Employee'), courseController.addCourseNote);
router.put('/:id/notes/:noteId', authenticate, authorizeRoles('Employee'), courseController.updateCourseNote);
router.delete('/:id/notes/:noteId', authenticate, authorizeRoles('Employee'), courseController.deleteCourseNote);

// Module management routes - Admin and SuperAdmin only
router.post('/:id/modules', authenticate, authorizeRoles('Admin'), courseController.addModule);
router.put('/:id/modules/:moduleId', authenticate, authorizeRoles('Admin'), courseController.updateModule);
router.delete('/:id/modules/:moduleId', authenticate, authorizeRoles('Admin'), courseController.deleteModule);

// Video management routes - Admin and SuperAdmin only
router.post('/:id/modules/:moduleId/videos', authenticate, authorizeRoles('Admin'), videoUpload, courseController.addVideo);
router.put('/:id/modules/:moduleId/videos/:videoId', authenticate, authorizeRoles('Admin'), videoUpload, courseController.updateVideo);
router.delete('/:id/modules/:moduleId/videos/:videoId', authenticate, authorizeRoles('Admin'), courseController.deleteVideo);

module.exports = router;