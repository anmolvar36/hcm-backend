const prisma = require('../config/prisma');

// GET /api/notifications
// Paginated, newest first, returns current user's notifications and unreadCount
const getNotifications = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.notification.count({ where: { userId: req.user.userId } }),
      prisma.notification.count({ where: { userId: req.user.userId, isRead: false } })
    ]);

    return res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/notifications/:id/read
// Mark a notification as read
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      return res.status(404).json({ success: false, error: { message: 'Notification not found.' } });
    }

    if (notification.userId !== req.user.userId) {
      return res.status(403).json({ success: false, error: { message: 'Access denied. You do not own this notification.' } });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });

    const unreadCount = await prisma.notification.count({ where: { userId: req.user.userId, isRead: false } });

    return res.status(200).json({ success: true, data: updated, unreadCount, message: 'Notification marked as read.' });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/notifications/read-all
// Mark all current user's notifications as read
const markAllAsRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, isRead: false },
      data: { isRead: true }
    });

    return res.status(200).json({ success: true, unreadCount: 0, message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/notifications/:id
// Delete a single notification
const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      return res.status(404).json({ success: false, error: { message: 'Notification not found.' } });
    }

    if (notification.userId !== req.user.userId) {
      return res.status(403).json({ success: false, error: { message: 'Access denied. You do not own this notification.' } });
    }

    await prisma.notification.delete({ where: { id } });

    const unreadCount = await prisma.notification.count({ where: { userId: req.user.userId, isRead: false } });

    return res.status(200).json({ success: true, unreadCount, message: 'Notification deleted.' });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/notifications
// Clear all notifications for the current user
const clearAllNotifications = async (req, res, next) => {
  try {
    await prisma.notification.deleteMany({
      where: { userId: req.user.userId }
    });

    return res.status(200).json({ success: true, unreadCount: 0, message: 'All notifications cleared.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications
};
