// ============================================================
// Auth Routes
// ============================================================
// Ye file URLs ko Controllers se jodhti hai

const express = require('express');
const router = express.Router();

const { login, register, getMe, changePassword, getMyPermissions } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

// Public Routes (login ke bina access)
router.post('/login', login);         // POST /api/auth/login
router.post('/register', register);   // POST /api/auth/register

// Protected Routes (JWT token required)
router.get('/me', protect, getMe);    // GET /api/auth/me
router.post('/change-password', protect, changePassword); // POST /api/auth/change-password

// Permission check - any authenticated user can get their own role's permissions
router.get('/my-permissions', protect, getMyPermissions); // GET /api/auth/my-permissions

module.exports = router;
