const express = require('express');
const router = express.Router();
const appraisalController = require('../controllers/appraisalController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// All routes require authentication
router.use(auth);

// Get all appraisals (HR/Admin can see all, employees see their own)
router.get('/', authorize(['Admin', 'HR', 'Manager', 'Employee']), appraisalController.getAppraisals);

// Get single appraisal
router.get('/:id', authorize(['Admin', 'HR', 'Manager', 'Employee']), appraisalController.getAppraisalById);

// Create new appraisal (HR/Admin/Manager)
router.post('/', authorize(['Admin', 'HR', 'Manager']), appraisalController.createAppraisal);

// Update appraisal
router.put('/:id', authorize(['Admin', 'HR', 'Manager', 'Employee']), appraisalController.updateAppraisal);

// Delete appraisal (Admin/HR only)
router.delete('/:id', authorize(['Admin', 'HR']), appraisalController.deleteAppraisal);

// Submit appraisal for review
router.post('/:id/submit', authorize(['Admin', 'HR', 'Manager', 'Employee']), appraisalController.submitAppraisal);

// Review appraisal (Approve/Reject)
router.post('/:id/review', authorize(['Admin', 'HR', 'Manager']), appraisalController.reviewAppraisal);

module.exports = router;