// ============================================================
// Auth Controller - Login, Register, Get Me
// ============================================================

const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { signToken } = require('../utils/jwtHelper');
const { z } = require('zod');
const { ensureDefaultRoles, getRoleCustomName } = require('../utils/roleSeeder');

// ---------- VALIDATION SCHEMAS (Zod) ----------
const loginSchema = z.object({
  email: z.string().email({ message: 'Valid email is required.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

const registerSchema = z.object({
  email: z.string().email({ message: 'Valid email is required.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  role: z.enum(['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CANDIDATE']).optional(),
  organizationId: z.string().optional(),
});

// ---------- CONTROLLERS ----------

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    // 1. Validate incoming request body
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const errMsg = parsed.error.issues?.[0]?.message || parsed.error.errors?.[0]?.message || parsed.error.message || 'Validation failed';
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: errMsg },
      });
    }

    const { email, password } = parsed.data;

    // 2. User ko DB mein dhundo
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { customRole: { select: { status: true, landingPage: true, inheritsFrom: true } } }
    });
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      });
    }

    // 3. Password check karo (bcrypt compare)
    const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      });
    }

    // 4. JWT Token banao
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    // Log login action
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        details: `User logged in successfully`,
        ipAddress: req.ip || req.socket.remoteAddress
      }
    });

    // Determine effective role for frontend to redirect properly
    const effectiveRole = (user.customRole && user.customRole.status === 'ACTIVE') 
      ? user.customRole.inheritsFrom 
      : user.role;

    // 5. Response bhejo (password kabhi mat bhejo!)
    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: effectiveRole,
          organizationId: user.organizationId,
          customRoleId: user.customRoleId,
          landingPage: (user.customRole?.status === 'ACTIVE' && user.customRole?.landingPage) ? user.customRole.landingPage : null,
        },
      },
    });

  } catch (err) {
    next(err); // Global error handler ko bhejo
  }
};

// POST /api/auth/register  (mainly for Candidates or Admin creating users)
const register = async (req, res, next) => {
  try {
    // 1. Validate
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const errMsg = parsed.error.issues?.[0]?.message || parsed.error.errors?.[0]?.message || parsed.error.message || 'Validation failed';
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: errMsg },
      });
    }

    const { email, password, role = 'CANDIDATE', organizationId } = parsed.data;

    // 2. Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'EMAIL_TAKEN', message: 'This email is already registered.' },
      });
    }

    // 3. Password hash karo (kabhi plain text save mat karo)
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. User create karo in DB
    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        organizationId: organizationId || null,
      },
    });

    // 5. Agar CANDIDATE hai to uska profile bhi banao
    if (role === 'CANDIDATE') {
      await prisma.candidateProfile.create({
        data: { userId: newUser.id },
      });
    }

    // 6. Token banao aur response bhejo
    const token = signToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    // Log registration action
    await prisma.auditLog.create({
      data: {
        userId: newUser.id,
        action: 'USER_REGISTER',
        details: `User registered successfully with role: ${role}`,
        ipAddress: req.ip || req.socket.remoteAddress
      }
    });

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
        },
      },
    });

  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me  (logged in user ki info lo)
const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        organizationId: true,
        createdAt: true,
        customRoleId: true,
        customRole: {
          select: { id: true, name: true, landingPage: true, permissionVersion: true, status: true, inheritsFrom: true }
        },
        employeeProfile: {
          select: {
            fullName: true,
            phone: true,
            dob: true,
            gender: true,
            address: true,
            avatarUrl: true,
            bio: true,
            language: true,
            timezone: true,
            dateFormat: true,
            emailNotif: true,
            pushNotif: true,
            weeklySummary: true
          }
        }
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    }

    // Override role with effective role from CustomRole if active
    if (user.customRole && user.customRole.status === 'ACTIVE') {
      user.role = user.customRole.inheritsFrom;
    }

    return res.status(200).json({ success: true, data: user });

  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-password (change password)
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: { message: 'Current password and new password are required.' } });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found.' } });
    }

    const isPasswordCorrect = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordCorrect) {
      return res.status(400).json({ success: false, error: { message: 'Incorrect current password.' } });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { passwordHash: newPasswordHash }
    });

    // Log password change
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'USER_PASSWORD_CHANGE',
        details: `User changed password successfully`,
        ipAddress: req.ip || req.socket.remoteAddress
      }
    });

    return res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/my-permissions  (returns the current user's role permissions from DB)
const getMyPermissions = async (req, res, next) => {
  try {
    const userRole = req.user?.role;
    const customRoleId = req.user?.customRoleId;
    const customRoleStatus = req.user?.customRoleStatus;

    // SUPERADMIN has full access — no DB lookup needed
    if (userRole === 'SUPERADMIN') {
      return res.status(200).json({
        success: true,
        data: { isSuperAdmin: true, permissions: null, role: 'SUPERADMIN', permissionVersion: 0 }
      });
    }

    let customRole = null;
    let isOverride = false;

    // 1. Check if user has an active custom role override
    if (customRoleId && customRoleStatus === 'ACTIVE') {
      customRole = await prisma.customRole.findUnique({ where: { id: customRoleId } });
      isOverride = !!customRole;
    }

    // 2. Fallback to base role
    if (!customRole || customRole.status !== 'ACTIVE') {
      const baseRoleName = getRoleCustomName(userRole);
      if (!baseRoleName) {
        return res.status(200).json({
          success: true,
          data: { permissions: {}, role: userRole }
        });
      }
      await ensureDefaultRoles();
      customRole = await prisma.customRole.findFirst({ where: { name: baseRoleName } });
      isOverride = false;
    }

    const permissions = customRole ? JSON.parse(customRole.permissions || '{}') : {};

    return res.status(200).json({
      success: true,
      data: {
        permissions,
        role: isOverride ? customRole.inheritsFrom : userRole,
        roleName: customRole ? customRole.name : userRole,
        isSuperAdmin: false,
        isCustomOverride: isOverride,
        permissionVersion: customRole?.permissionVersion || 1,
        landingPage: (isOverride && customRole?.landingPage) ? customRole.landingPage : null
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, register, getMe, changePassword, getMyPermissions };
