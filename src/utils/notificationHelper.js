const prisma = require('../config/prisma');

/**
 * Reusable helper to create a database notification for a user.
 * @param {Object} params
 * @param {string} params.userId - Target user's ID
 * @param {string} params.title - Notification title
 * @param {string} params.message - Detailed message
 * @param {string} [params.type] - Type: INFO, SUCCESS, WARNING, ALERT
 * @param {string} [params.link] - Optional link for redirecting
 * @param {Object} [params.metadata] - Optional additional JSON metadata
 */
const createNotification = async ({ userId, title, message, type = 'INFO', link = null, metadata = null }) => {
  try {
    if (!userId) {
      console.warn('createNotification called without userId. Skipping.');
      return null;
    }

    // Normalize type to match the Prisma enum conventions (INFO, SUCCESS, WARNING, ALERT)
    let normalizedType = 'INFO';
    const upperType = String(type).toUpperCase();
    if (['INFO', 'SUCCESS', 'WARNING', 'ALERT'].includes(upperType)) {
      normalizedType = upperType;
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: normalizedType,
        link,
        ...(metadata && { metadata })
      }
    });

    return notification;
  } catch (err) {
    console.error('Failed to create notification:', err);
    return null;
  }
};

module.exports = {
  createNotification
};
