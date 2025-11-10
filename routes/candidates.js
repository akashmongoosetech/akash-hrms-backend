const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// Routes for candidates
router.get('/fetch-save', auth, authorize(['Admin', 'SuperAdmin']), candidateController.fetchAndSaveCandidates);
router.get('/', auth, authorize(['Admin', 'SuperAdmin']), candidateController.getCandidates);
router.put('/:id/status', auth, authorize(['Admin', 'SuperAdmin']), candidateController.updateCandidateStatus);

module.exports = router;