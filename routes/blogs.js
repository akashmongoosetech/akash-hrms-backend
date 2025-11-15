const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const blogController = require('../controllers/blogController');
const authenticate = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

// Configure upload for multiple files (featured image + section images)
const cpUpload = upload.fields([
  { name: 'featuredImage', maxCount: 1 },
  // Allow up to 10 section images (sectionImage0, sectionImage1, etc.)
  ...Array.from({ length: 10 }, (_, i) => ({ name: `sectionImage${i}`, maxCount: 1 }))
]);

// Get all blogs - Employee and above
router.get('/', authenticate, authorizeRoles('Employee'), blogController.getBlogs);

// Get blog by slug - Employee and above
router.get('/:slug', authenticate, authorizeRoles('Employee'), blogController.getBlogBySlug);

// Create new blog - Admin and SuperAdmin only
router.post('/', authenticate, authorizeRoles('Admin'), cpUpload, blogController.createBlog);

// Update blog by slug - Admin and SuperAdmin only
router.put('/:slug', authenticate, authorizeRoles('Admin'), cpUpload, blogController.updateBlog);

// Delete blog by slug - Admin and SuperAdmin only
router.delete('/:slug', authenticate, authorizeRoles('Admin'), blogController.deleteBlog);

module.exports = router;