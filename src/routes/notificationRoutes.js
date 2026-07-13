const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications
} = require('../controllers/notificationController');

// All notification routes must be protected
router.use(protect);

router.get('/', getNotifications);
router.patch('/read-all', markAllAsRead); // Important: Placed BEFORE /:id/read to avoid parameter collision
router.patch('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);
router.delete('/', clearAllNotifications);

module.exports = router;
