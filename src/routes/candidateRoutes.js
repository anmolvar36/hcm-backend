// ============================================================
// Candidate Routes  →  /api/candidate/*
// ============================================================
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');

const {
  getAvailableJobs,
  applyToJob,
  getMyApplications,
  withdrawApplication,
  getCandidateProfile,
  updateCandidateProfile,
  updateSettings,
  getSettings,
  getMyOffers,
  respondToOffer,
} = require('../controllers/candidateController');

// Public - Anyone can browse jobs
router.get('/jobs', getAvailableJobs);

// Protected - Only CANDIDATE
router.use(protect, authorize('CANDIDATE'));
router.post('/jobs/:jobId/apply', applyToJob);
router.get('/applications', getMyApplications);
router.delete('/applications/:appId', withdrawApplication);
router.get('/profile', getCandidateProfile);
router.put('/profile', updateCandidateProfile);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// Offer automation
router.get('/offers', getMyOffers);
router.patch('/offers/:id/respond', respondToOffer);

module.exports = router;
