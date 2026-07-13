// ============================================================
// Public Routes - Demo Booking, Contact Form, Career Applications
// ============================================================

const express = require('express');
const router = express.Router();

const { bookDemo, submitContact, submitCareerApplication, getAvailableJobs, getPlatformStats } = require('../controllers/publicController');

// Public Routes (no authentication required)
router.post('/demo-booking', bookDemo);
router.post('/contact', submitContact);
router.post('/career-apply', submitCareerApplication);
router.get('/jobs', getAvailableJobs);
router.get('/platform-stats', getPlatformStats);

module.exports = router;
