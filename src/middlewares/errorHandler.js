// ============================================================
// Global Error Handler Middleware
// ============================================================
// Ye middleware saari errors ko ek jagah pakadta hai
// Har controller mein try-catch nahi likhna padta

const errorHandler = (err, req, res, next) => {
  // Default status code 500 (Internal Server Error)
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[ERROR] ${req.method} ${req.url} → ${statusCode}: ${message}`);
  if (err.stack) console.error(err.stack);
  if (err.code) console.error(`[Prisma Code] ${err.code}`, err.meta || '');

  return res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: message,
    },
  });
};

module.exports = errorHandler;
