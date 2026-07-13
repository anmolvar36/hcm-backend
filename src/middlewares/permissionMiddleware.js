// ============================================================
// Permission Middleware
// Validates module-level permissions from DB for sensitive routes
// Usage: checkPermission('users', 'delete')
// ============================================================

const prisma = require('../config/prisma');
const { getRoleCustomName } = require('../utils/roleSeeder');

/**
 * Factory: returns Express middleware that checks if the authenticated user
 * has the specified action permission for a module.
 *
 * @param {string} module  - e.g. 'users', 'departments', 'payroll_center'
 * @param {string} action  - e.g. 'view', 'create', 'edit', 'delete', 'approve', 'manage'
 */
const checkPermission = (module, action = 'view') => {
  return async (req, res, next) => {
    try {
      const userRole = req.user?.role;

      // SUPERADMIN bypasses all module-level checks
      if (userRole === 'SUPERADMIN') return next();

      let customRole = null;

      // 1. Check if user has an active custom role override
      if (req.user?.customRoleId && req.user?.customRoleStatus === 'ACTIVE') {
        customRole = await prisma.customRole.findUnique({ where: { id: req.user.customRoleId } });
      }

      // 2. Fallback to base role (e.g. "Admin Role", "Employee Role")
      if (!customRole || customRole.status !== 'ACTIVE') {
        const customRoleName = getRoleCustomName(userRole);
        if (!customRoleName) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: `You do not have permission to perform this action.`
            }
          });
        }
        // Load permissions from DB
        customRole = await prisma.customRole.findFirst({ where: { name: customRoleName } });
      }

      if (!customRole) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Role permissions not configured. Contact your administrator.'
          }
        });
      }

      const permissions = JSON.parse(customRole.permissions || '{}');
      const modulePerms = permissions[module];

      // If the module permissions array doesn't exist or is empty → no access
      if (!Array.isArray(modulePerms) || modulePerms.length === 0) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'MODULE_ACCESS_DENIED',
            message: `Access to '${module}' module has been revoked for your role.`
          }
        });
      }

      // For 'view', any non-empty array grants access
      if (action === 'view') return next();

      // For other actions, check specifically
      if (!modulePerms.includes(action)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACTION_DENIED',
            message: `You do not have '${action}' permission on the '${module}' module.`
          }
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { checkPermission };
