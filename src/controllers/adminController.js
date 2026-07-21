// ============================================================
// Admin Controller
// ============================================================
// Handles: Organization, Departments, Users, Payroll, Audit Logs, Dashboard Stats

const prisma = require('../config/prisma');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { ensureDefaultRoles } = require('../utils/roleSeeder');
const { isWorkflowEnabled, processApproval } = require('../services/approval.service');
const calendarResolver = require('../utils/calendarResolver');

const roleToEnum = (role = '') => {
  const normalized = String(role).trim().toUpperCase().replace(/[\s-]+/g, '_');
  const map = {
    SUPER_ADMIN: 'SUPERADMIN',
    ADMIN: 'ADMIN',
    HR: 'HR',
    HR_MANAGER: 'HR',
    MANAGER: 'MANAGER',
    EMPLOYEE: 'EMPLOYEE',
    CANDIDATE: 'CANDIDATE',
  };
  return map[normalized] || normalized;
};

const optionalString = () => z.string().trim().nullish();

const organizationSchema = z.object({
  name: optionalString(),
  legalName: optionalString(),
  websiteUrl: optionalString(),
  industry: optionalString(),
  companySize: optionalString(),
  logoUrl: z.string().nullish(),
  address: optionalString(),
  taxId: optionalString(),
  primaryEmail: optionalString(),
  supportPhone: optionalString(),
  timezone: optionalString(),
});

const buildOrganizationPayload = (body) => {
  const parsed = organizationSchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues?.[0]?.message || 'Invalid organization data.' };

  const data = Object.fromEntries(
    Object.entries(parsed.data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
  );

  return {
    data: {
      ...data,
      name: data.name || data.legalName || data.primaryEmail || 'Organization',
      logoUrl: data.logoUrl || null,
      address: data.address || null,
      taxId: data.taxId || null,
      legalName: data.legalName || null,
      websiteUrl: data.websiteUrl || null,
      industry: data.industry || null,
      companySize: data.companySize || null,
      primaryEmail: data.primaryEmail || null,
      supportPhone: data.supportPhone || null,
      timezone: data.timezone || null,
    }
  };
};

// ─────────────────────────────────────────
// DASHBOARD STATS  →  GET /api/admin/stats
// ─────────────────────────────────────────
const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalEmployees,
      totalDepartments,
      pendingLeaves,
      openTickets,
      todayAttendance,
      unpaidPayslips,
    ] = await Promise.all([
      prisma.employeeProfile.count(),
      prisma.department.count(),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.attendanceLog.count({ where: { date: { gte: (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })() } } }),
      prisma.payslip.count({ where: { status: 'Unpaid' } }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalEmployees,
        totalDepartments,
        pendingLeaves,
        openTickets,
        todayAttendance,
        unpaidPayslips,
      },
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// ORGANIZATION
// ─────────────────────────────────────────

// GET /api/admin/organization
const getOrganization = async (req, res, next) => {
  try {
    const org = await prisma.organization.findFirst();
    return res.status(200).json({ success: true, data: org });
  } catch (err) { next(err); }
};

// POST /api/admin/organization  (create if not exists)
const createOrganization = async (req, res, next) => {
  try {
    const payload = buildOrganizationPayload(req.body);
    if (payload.error) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: payload.error } });
    }

    const org = await prisma.organization.create({ data: payload.data });
    return res.status(201).json({ success: true, data: org, message: 'Organization created.' });
  } catch (err) { next(err); }
};

// PUT /api/admin/organization/:id
const updateOrganization = async (req, res, next) => {
  try {
    const payload = buildOrganizationPayload(req.body);
    if (payload.error) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: payload.error } });
    }

    const org = await prisma.organization.update({
      where: { id: req.params.id },
      data: payload.data,
    });
    return res.status(200).json({ success: true, data: org });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// DEPARTMENTS
// ─────────────────────────────────────────

// GET /api/admin/departments
const getDepartments = async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({ success: true, data: departments });
  } catch (err) { next(err); }
};

const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name must be at least 2 characters'),
  organizationId: z.string().uuid().optional(),
  code: z.string().trim().nullish(),
  head: z.string().trim().nullish(),
  parent: z.string().trim().nullish(),
  description: z.string().trim().nullish(),
  color: z.string().trim().nullish(),
  status: z.string().trim().nullish(),
});

const resolveOrganizationId = async (organizationId) => {
  if (organizationId) return organizationId;
  const org = await prisma.organization.findFirst({ select: { id: true } });
  return org?.id || null;
};

// POST /api/admin/departments
const createDepartment = async (req, res, next) => {
  try {
    const parsed = departmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues?.[0]?.message || 'Invalid department data.' },
      });
    }

    const organizationId = await resolveOrganizationId(parsed.data.organizationId);
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_ORGANIZATION', message: 'Organization must be configured before creating departments.' },
      });
    }

    const dept = await prisma.department.create({
      data: {
        name: parsed.data.name,
        organizationId,
        code: parsed.data.code || null,
        head: parsed.data.head || null,
        parent: parsed.data.parent || 'Corporate',
        description: parsed.data.description || null,
        color: parsed.data.color || '#4f46e5',
        status: parsed.data.status || 'Active',
      },
      include: { _count: { select: { employees: true } } },
    });
    return res.status(201).json({ success: true, data: dept, message: 'Department created.' });
  } catch (err) {
    console.error('[createDepartment] Error:', err.message, err.code, err.meta);
    next(err);
  }
};

// PUT /api/admin/departments/:id
const updateDepartment = async (req, res, next) => {
  try {
    const parsed = departmentSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues?.[0]?.message || 'Invalid department data.' },
      });
    }

    const data = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined)
    );

    const dept = await prisma.department.update({
      where: { id: req.params.id },
      data,
      include: { _count: { select: { employees: true } } },
    });
    return res.status(200).json({ success: true, data: dept, message: 'Department updated.' });
  } catch (err) { next(err); }
};

// DELETE /api/admin/departments/:id
const deleteDepartment = async (req, res, next) => {
  try {
    await prisma.department.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Department deleted.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────

const getAllUsers = async (req, res, next) => {
  try {
    let organizationId = req.user.organizationId;
    if (!organizationId) {
      const defaultOrg = await prisma.organization.findFirst({ select: { id: true } });
      organizationId = defaultOrg?.id;
    }

    if (!organizationId) {
      return res.status(200).json({ success: true, data: [], meta: { total: 0 } });
    }

    const users = await prisma.user.findMany({
      where: {
        role: { notIn: ['SUPERADMIN', 'CANDIDATE'] },
        organizationId: organizationId,
      },
      include: {
        customRole: { select: { id: true, name: true, inheritsFrom: true, status: true } },
        employeeProfile: {
          include: {
            department: true,
            manager: true,
            compensationProfile: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: users, meta: { total: users.length } });
  } catch (err) { next(err); }
};

// POST /api/admin/users
const createUser = async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2, 'Full name is required.'),
      email: z.string().trim().email('Valid email is required.'),
      phone: z.string().regex(/^\d{8,15}$/, 'Phone number must be between 8 and 15 digits.'),
      empId: z.string().trim().min(2, 'Employee ID is required.'),
      role: z.string().trim().min(1, 'Organization role is required.'),
      department: z.string().trim().min(1, 'Department is required.'),
      manager: z.string().trim().min(1, 'Reporting manager is required.'),
      joinDate: z.string().trim().min(1, 'Joining date is required.'),
      empType: z.string().trim().min(1, 'Employment type is required.'),
      status: z.enum(['Active', 'Inactive', 'Pending']),
      address: z.string().trim().min(1, 'Residential address is required.'),
      img: z.string().optional(),
      password: z.string().min(6).optional(),
      monthlyCTC: z.number().optional().nullable(),
      salaryStructureId: z.string().optional().nullable(),
      salaryVersionId: z.string().optional().nullable(),
      effectiveDate: z.string().optional().nullable(),
      customRoleId: z.string().optional().nullable(),
      shiftId: z.string().optional().nullable(),
      overtimePolicyId: z.string().optional().nullable(),
      salaryType: z.enum(['Monthly', 'Hourly']).optional(),
      hourlyRate: z.number().optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues?.[0]?.message || 'Validation error' } });
    }

    const data = parsed.data;
    const role = roleToEnum(data.role);
    if (!['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CANDIDATE'].includes(role)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid organization role.' } });
    }

    const [existingEmail, existingEmpId] = await Promise.all([
      prisma.user.findUnique({ where: { email: data.email } }),
      prisma.employeeProfile.findUnique({ where: { employeeId: data.empId } }),
    ]);

    if (existingEmail) {
      return res.status(409).json({ success: false, error: { code: 'EMAIL_TAKEN', message: 'Email already exists.' } });
    }
    if (existingEmpId) {
      return res.status(409).json({ success: false, error: { code: 'EMPID_TAKEN', message: 'Employee ID already exists.' } });
    }

    const organizationId = req.user.organizationId || (await prisma.organization.findFirst({ select: { id: true } }))?.id || null;
    const department = await prisma.department.findFirst({
      where: {
        OR: [{ id: data.department }, { name: data.department }],
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true },
    });

    if (!department) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Selected department was not found.' } });
    }

    let managerId = null;
    if (data.manager !== 'None') {
      const manager = await prisma.employeeProfile.findFirst({
        where: {
          OR: [{ id: data.manager }, { fullName: data.manager }, { employeeId: data.manager }],
        },
        select: { id: true },
      });
      if (!manager) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Selected reporting manager was not found.' } });
      }
      managerId = manager.id;
    }

    const defaultStructure = await prisma.salaryStructure.findFirst({
      where: { organizationId, isDefault: true }
    }) || await prisma.salaryStructure.findFirst({
      where: { organizationId }
    });

    const passwordHash = await bcrypt.hash(data.password || 'password123', 10);

    let validCustomRoleId = null;
    if (data.customRoleId && role !== 'SUPERADMIN') {
      const customRole = await prisma.customRole.findUnique({ where: { id: data.customRoleId } });
      if (customRole && customRole.status === 'ACTIVE') {
        validCustomRoleId = customRole.id;
      }
    }

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role,
        isActive: data.status === 'Active',
        status: data.status,
        organizationId,
        customRoleId: validCustomRoleId,
        employeeProfile: {
          create: {
            employeeId: data.empId,
            fullName: data.name,
            phone: data.phone,
            address: data.address,
            joiningDate: new Date(data.joinDate),
            employmentType: data.empType,
            avatarUrl: data.img || null,
            departmentId: department.id,
            managerId,
            salaryType: data.salaryType || 'Monthly',
            hourlyRate: data.hourlyRate || null,
            shiftId: data.shiftId || null,
            overtimePolicyId: data.overtimePolicyId || null,
            compensationProfile: {
              create: {
                monthlyCTC: data.monthlyCTC || 0,
                annualCTC: (data.monthlyCTC || 0) * 12,
                salaryStructureId: data.salaryStructureId || (defaultStructure ? defaultStructure.id : null),
                salaryVersionId: data.salaryVersionId || (defaultStructure ? defaultStructure.currentVersionId : null),
                effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : new Date(data.joinDate),
                reason: 'Initial Setup',
                status: 'Active'
              }
            }
          },
        },
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        status: true,
        createdAt: true,
        employeeProfile: {
          select: {
            id: true,
            fullName: true,
            employeeId: true,
            phone: true,
            address: true,
            joiningDate: true,
            employmentType: true,
            avatarUrl: true,
            department: { select: { id: true, name: true } },
            manager: { select: { id: true, fullName: true, employeeId: true } },
          },
        },
      },
    });

    return res.status(201).json({ success: true, data: user, message: 'User created.' });
  } catch (err) { next(err); }
};

// PATCH /api/admin/users/:id/role
const changeUserRole = async (req, res, next) => {
  try {
    const schema = z.object({
      role: z.string().trim().min(1, 'Role is required'),
      customRoleId: z.string().optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues?.[0]?.message || 'Validation error' } });
    }

    const role = roleToEnum(parsed.data.role);
    if (!['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CANDIDATE'].includes(role)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid organization role.' } });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetUser || targetUser.role === 'SUPERADMIN') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    }

    let validCustomRoleId = null;
    if (parsed.data.customRoleId && role !== 'SUPERADMIN') {
      const customRole = await prisma.customRole.findUnique({ where: { id: parsed.data.customRoleId } });
      if (customRole && customRole.status === 'ACTIVE') {
        validCustomRoleId = customRole.id;
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role, customRoleId: validCustomRoleId },
      select: { id: true, email: true, role: true, customRoleId: true },
    });

    if (req.user?.userId) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE_USER_ROLE',
          details: `Updated role for user ${user.email} to ${role} ${validCustomRoleId ? 'with custom override' : ''}`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    try {
      const { createNotification } = require('../utils/notificationHelper');
      await createNotification({
        userId: user.id,
        title: 'System Security Patch',
        message: `Your account role has been updated to ${role}.`,
        type: 'WARNING',
        link: '/employee/settings'
      });
    } catch (notifErr) {
      console.error('Failed to trigger user role update notification:', notifErr);
    }

    return res.status(200).json({ success: true, data: user, message: 'Role updated.' });
  } catch (err) { next(err); }
};

// PATCH /api/admin/users/:id/toggle-active
const toggleUserActive = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    if (user.role === 'SUPERADMIN') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: !user.isActive, status: !user.isActive ? 'Active' : 'Inactive' },
    });

    try {
      const { createNotification } = require('../utils/notificationHelper');
      await createNotification({
        userId: updated.id,
        title: 'System Security Patch',
        message: `Your account status has been set to ${updated.isActive ? 'Active' : 'Inactive'}.`,
        type: 'WARNING',
        link: '/employee/settings'
      });
    } catch (notifErr) {
      console.error('Failed to trigger user status update notification:', notifErr);
    }

    return res.status(200).json({ success: true, data: { isActive: updated.isActive }, message: `User ${updated.isActive ? 'activated' : 'deactivated'}.` });
  } catch (err) { next(err); }
};

// PUT /api/admin/users/:id
const updateUser = async (req, res, next) => {
  try {
    const { name, email, role, department, empType, status, phone, address, manager, shiftId, overtimePolicyId, 
      salaryType, hourlyRate, departmentId, password, customRoleId } = req.body;
      
    const existingUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { employeeProfile: true }
    });
    if (!existingUser) return res.status(404).json({ success: false, error: { message: 'User not found' } });
    if (existingUser.role === 'SUPERADMIN') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    }

    let finalDeptId = departmentId;
    if (department) {
      const dept = await prisma.department.findFirst({
        where: { OR: [{ id: department }, { name: department }] }
      });
      if (dept) finalDeptId = dept.id;
    }

    let managerId = undefined;
    if (manager && manager !== 'None') {
      const managerUser = await prisma.employeeProfile.findFirst({
        where: { OR: [{ fullName: manager }, { employeeId: manager }, { id: manager }] }
      });
      if (managerUser) managerId = managerUser.id;
    }

    const empData = {
      ...(name !== undefined && { fullName: name }),
      ...(empType !== undefined && { employmentType: empType }),
      ...(phone !== undefined && { phone }),
      ...(address !== undefined && { address }),
      ...(managerId !== undefined && { managerId }),
      ...(shiftId !== undefined && { shiftId: shiftId || null }),
      ...(overtimePolicyId !== undefined && { overtimePolicyId: overtimePolicyId || null }),
      ...(salaryType !== undefined && { salaryType }),
      ...(hourlyRate !== undefined && { hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null }),
      ...(finalDeptId !== undefined && { departmentId: finalDeptId || null })
    };

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(email !== undefined && { email }),
        ...(role !== undefined && { role: roleToEnum(role) }),
        ...(status !== undefined && { status, isActive: status.toLowerCase() === 'active' }),
        ...(customRoleId !== undefined && { customRoleId: customRoleId || null }),
        ...(password && { passwordHash: await bcrypt.hash(password, 10) }),
        employeeProfile: existingUser.employeeProfile ? {
          update: empData
        } : {
          create: {
            fullName: name || (email || existingUser.email).split('@')[0],
            employeeId: 'EMP-' + Math.floor(Math.random() * 100000),
            ...empData
          }
        }
      },
      include: { employeeProfile: true }
    });

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE_USER',
          details: `Updated user profile for ${user.email}`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (err) { next(err); }
};

const deleteUser = async (req, res, next) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    if (existing.role === 'SUPERADMIN') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    }

    await prisma.user.delete({ where: { id: req.params.id } });

    if (req.user && existing) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'DELETE_USER',
          details: `Deleted user: ${existing.email}`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    return res.status(200).json({ success: true, message: 'User deleted' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// PAYROLL MANAGEMENT
// ─────────────────────────────────────────

// GET /api/admin/payslips
const getAllPayslips = async (req, res, next) => {
  try {
    const { month, status } = req.query;

    const payslips = await prisma.payslip.findMany({
      where: {
        ...(month && { month }),
        ...(status && { status }),
      },
      include: {
        employee: { select: { fullName: true, employeeId: true, userId: true, department: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: payslips });
  } catch (err) { next(err); }
};

// POST /api/admin/payslips  (generate payslip)
const generatePayslip = async (req, res, next) => {
  try {
    const schema = z.object({
      employeeId: z.string(),
      month: z.string(),
      basic: z.number(),
      hra: z.number(),
      allowance: z.number(),
      bonus: z.number().optional(),
      pf: z.number(),
      tax: z.number(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues?.[0]?.message || 'Validation error' } });
    }

    const { employeeId, month, basic, hra, allowance, bonus = 0, pf, tax } = parsed.data;

    let targetProfileId = employeeId;
    let profile = await prisma.employeeProfile.findUnique({
      where: { id: targetProfileId },
      include: { overtimePolicy: true }
    });

    if (!profile) {
      profile = await prisma.employeeProfile.findUnique({
        where: { userId: targetProfileId }
      });

      if (!profile) {
        const user = await prisma.user.findUnique({
          where: { id: targetProfileId }
        });
        if (user) {
          profile = await prisma.employeeProfile.create({
            data: {
              userId: user.id,
              fullName: user.email.split('@')[0],
              employeeId: 'EMP-' + user.id.slice(0, 3).toUpperCase(),
            }
          });
        }
      }

      if (profile) {
        targetProfileId = profile.id;
      } else {
        return res.status(444).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee profile not found and could not be created.' } });
      }
    }

    const settings = await prisma.globalSettings.findFirst();
    let currencyCode = 'USD';
    if (settings?.masterCurrency) {
      const curr = settings.masterCurrency;
      if (curr.includes('INR') || curr.includes('₹')) currencyCode = 'INR';
      else if (curr.includes('EUR') || curr.includes('€')) currencyCode = 'EUR';
      else if (curr.includes('GBP') || curr.includes('£')) currencyCode = 'GBP';
      else if (curr.includes('AED') || curr.includes('د.إ')) currencyCode = 'AED';
    }

    // DYNAMIC PAYROLL LOGIC
    const logs = await prisma.attendanceLog.findMany({
      where: { userId: profile.userId }
    });

    const targetMonthStr = month.toLowerCase();
    const isYYYYMM = /^\d{4}-\d{2}$/.test(month);

    // --- INTEGRATE ENTERPRISE CALENDAR FOR WORKING DAYS ---
    let calendarWorkingDays = 0;
    let calendarDays = 0;
    let holidaysCount = 0;
    let weekendsCount = 0;

    if (isYYYYMM) {
      try {
        const [yyyy, mm] = month.split('-');
        const daysInMonth = new Date(yyyy, mm, 0).getDate();
        calendarDays = daysInMonth;

        for (let day = 1; day <= daysInMonth; day++) {
          const checkDate = new Date(yyyy, mm - 1, day);
          const dayType = await calendarResolver.getDayType(profile.userId, checkDate);

          if (dayType.type === 'WORKING_DAY') {
            calendarWorkingDays += 1;
          } else if (dayType.type === 'WEEKEND') {
            if (dayType.detail.type === 'HALF_DAY') calendarWorkingDays += 0.5;
            weekendsCount++;
          } else if (dayType.type === 'HOLIDAY') {
            holidaysCount++;
          }
        }
        console.log(`[Payroll Calendar] Employee: ${profile.userId}, Month: ${month} -> Working Days: ${calendarWorkingDays}, Weekends: ${weekendsCount}, Holidays: ${holidaysCount}`);
      } catch (calErr) {
        console.warn(`[Payroll Calendar Warning] ${calErr.message}. Defaulting working days logic.`);
      }
    }
    // ------------------------------------------------------

    let totalWorkedMin = 0;
    let totalOTMin = 0;

    logs.forEach(log => {
      const d = new Date(log.date);
      let match = false;
      if (isYYYYMM) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        if (`${yyyy}-${mm}` === month) match = true;
      } else {
        const logMonth = d.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toLowerCase();
        const logMonthShort = d.toLocaleString('en-US', { month: 'short', year: 'numeric' }).toLowerCase();
        if (targetMonthStr === logMonth || targetMonthStr === logMonthShort || targetMonthStr.includes(logMonth) || targetMonthStr.includes(logMonthShort)) {
          match = true;
        }
      }

      if (match) {
        totalWorkedMin += log.totalWorkedMin;
        totalOTMin += log.overtimeMinutes;
      }
    });

    let finalBasic = basic;
    let finalBonus = bonus || 0;

    if (profile.salaryType === 'Hourly' && profile.hourlyRate) {
      const hoursWorked = totalWorkedMin / 60;
      finalBasic = hoursWorked * profile.hourlyRate;
    }

    if (totalOTMin > 0) {
      let hourlyRate = profile.hourlyRate || 0;
      if (!hourlyRate && profile.salaryType === 'Monthly') {
        const base = finalBasic + hra + allowance;
        hourlyRate = base / 160;
      }

      let otRateMultiplier = 1.0;
      if (profile.overtimePolicy) {
        otRateMultiplier = profile.overtimePolicy.weekdayMultiplier || 1.5;
      } else {
        const defPolicy = await prisma.overtimePolicy.findFirst({ where: { isDefault: true } });
        if (defPolicy) otRateMultiplier = defPolicy.weekdayMultiplier;
      }

      const otHours = totalOTMin / 60;
      const otPay = otHours * hourlyRate * otRateMultiplier;
      finalBonus += otPay;
    }

    const netPay = finalBasic + hra + allowance + finalBonus - pf - tax;

    // Check if a payslip already exists for this employee and month
    const existing = await prisma.payslip.findFirst({
      where: { employeeId: targetProfileId, month }
    });

    let payslip;
    if (existing) {
      payslip = await prisma.payslip.update({
        where: { id: existing.id },
        data: { basic: finalBasic, hra, allowance, bonus: finalBonus, pf, tax, netPay, currency: currencyCode }
      });
    } else {
      payslip = await prisma.payslip.create({
        data: { employeeId: targetProfileId, month, basic: finalBasic, hra, allowance, bonus: finalBonus, pf, tax, netPay, status: 'Unpaid', currency: currencyCode },
      });
    }

    try {
      const { createNotification } = require('../utils/notificationHelper');
      const empProfile = await prisma.employeeProfile.findUnique({
        where: { id: targetProfileId },
        select: { userId: true }
      });
      if (empProfile && empProfile.userId) {
        await createNotification({
          userId: empProfile.userId,
          title: 'Payroll Processed',
          message: `Your payout sheet for ${month} is ready.`,
          type: 'SUCCESS',
          link: '/employee/payroll'
        });
      }
    } catch (notifErr) {
      console.error('Failed to trigger payslip generation notification:', notifErr);
    }

    return res.status(201).json({ success: true, data: payslip, message: 'Payslip generated.' });
  } catch (err) { next(err); }
};

// PATCH /api/admin/payslips/:id/pay
const markPayslipPaid = async (req, res, next) => {
  try {
    const payslip = await prisma.payslip.update({
      where: { id: req.params.id },
      data: { status: 'Paid', paymentDate: new Date() },
    });

    try {
      const { createNotification } = require('../utils/notificationHelper');
      const empProfile = await prisma.employeeProfile.findUnique({
        where: { id: payslip.employeeId },
        select: { userId: true }
      });
      if (empProfile && empProfile.userId) {
        await createNotification({
          userId: empProfile.userId,
          title: 'Payroll Processed',
          message: `Your payout sheet for ${payslip.month} has been paid.`,
          type: 'SUCCESS',
          link: '/employee/payroll'
        });
      }
    } catch (notifErr) {
      console.error('Failed to trigger payslip payment notification:', notifErr);
    }

    return res.status(200).json({ success: true, data: payslip, message: 'Payslip marked as paid.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────

// GET /api/admin/audit-logs
const getAuditLogs = async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: { user: { select: { email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.status(200).json({ success: true, data: logs });
  } catch (err) { next(err); }
};

// ============================================================
// 12. COMPLIANCE POLICIES
// ============================================================

// GET /api/admin/policies
const getPolicies = async (req, res, next) => {
  try {
    const policies = await prisma.policy.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: policies });
  } catch (err) { next(err); }
};

// POST /api/admin/policies
const createPolicy = async (req, res, next) => {
  try {
    const { name, category, department, owner, effectiveDate, expiryDate, version, requiresSignature, status, description, pdfName, pdfData, acknowledgments } = req.body;
    const policy = await prisma.policy.create({
      data: {
        name,
        category,
        owner,
        ...(department && { department }),
        ...(effectiveDate && { effectiveDate }),
        ...(expiryDate && { expiryDate }),
        ...(version && { version }),
        ...(requiresSignature !== undefined && { requiresSignature }),
        ...(status && { status }),
        ...(description && { description }),
        ...(pdfName && { pdfName }),
        ...(pdfData && { pdfData }),
        ...(acknowledgments && { acknowledgments }),
      },
    });
    return res.status(201).json({ success: true, data: policy, message: 'Policy created.' });
  } catch (err) { next(err); }
};

// PUT /api/admin/policies/:id
const updatePolicy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, category, department, owner, effectiveDate, expiryDate, version, requiresSignature, status, description, pdfName, pdfData, acknowledgments } = req.body;
    const policy = await prisma.policy.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(category && { category }),
        ...(department && { department }),
        ...(owner && { owner }),
        ...(effectiveDate && { effectiveDate }),
        ...(expiryDate && { expiryDate }),
        ...(version && { version }),
        ...(requiresSignature !== undefined && { requiresSignature }),
        ...(status && { status }),
        ...(description !== undefined && { description }),
        ...(pdfName !== undefined && { pdfName }),
        ...(pdfData !== undefined && { pdfData }),
        ...(acknowledgments && { acknowledgments }),
      },
    });
    return res.status(200).json({ success: true, data: policy, message: 'Policy updated.' });
  } catch (err) { next(err); }
};

// DELETE /api/admin/policies/:id
const deletePolicy = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.policy.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Policy deleted.' });
  } catch (err) { next(err); }
};

// PATCH /api/admin/policies/:id/archive
const toggleArchivePolicy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const policy = await prisma.policy.findUnique({ where: { id } });
    if (!policy) {
      return res.status(404).json({ success: false, error: { message: 'Policy not found.' } });
    }
    const newStatus = policy.status === 'Archived' ? 'Active' : 'Archived';
    const updated = await prisma.policy.update({
      where: { id },
      data: { status: newStatus },
    });
    return res.status(200).json({ success: true, data: updated, message: `Policy marked as ${newStatus}.` });
  } catch (err) { next(err); }
};

// POST /api/admin/policies/:id/renew
const renewPolicy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, category, department, owner, effectiveDate, expiryDate, version, requiresSignature, description, pdfName, pdfData } = req.body;

    // Update the policy itself with new data
    const policy = await prisma.policy.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(category && { category }),
        ...(department && { department }),
        ...(owner && { owner }),
        ...(effectiveDate && { effectiveDate }),
        ...(expiryDate && { expiryDate }),
        ...(version && { version }),
        ...(requiresSignature !== undefined && { requiresSignature }),
        status: 'Active',
        ...(description !== undefined && { description }),
        ...(pdfName !== undefined && { pdfName }),
        ...(pdfData !== undefined && { pdfData }),
        // Reset acknowledgment string format (e.g. 0/50 instead of 45/50)
        // We will just set it to '0' initially, frontend logic will format it to `0/totalEmployees`
        acknowledgments: '0'
      },
    });

    // Wipe all existing employee acknowledgments for this policy
    await prisma.policyAcknowledgment.deleteMany({
      where: { policyId: id }
    });

    return res.status(200).json({ success: true, data: policy, message: 'Policy renewed successfully.' });
  } catch (err) { next(err); }
};

// POST /api/admin/policies/:id/remind
const sendPolicyReminder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const policy = await prisma.policy.findUnique({ where: { id } });
    if (!policy) {
      return res.status(404).json({ success: false, error: { message: 'Policy not found.' } });
    }

    // Get all users who have not acknowledged this policy
    const acknowledgedUsers = await prisma.policyAcknowledgment.findMany({
      where: { policyId: id },
      select: { userId: true }
    });

    const ackUserIds = acknowledgedUsers.map(a => a.userId);

    // Find active employees who have NOT acknowledged it
    const pendingUsers = await prisma.user.findMany({
      where: {
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        id: { notIn: ackUserIds }
      }
    });

    const { createNotification } = require('../utils/notificationHelper');
    let sentCount = 0;

    for (const user of pendingUsers) {
      await createNotification({
        userId: user.id,
        title: 'Action Required: Policy Acknowledgment',
        message: `Please review and acknowledge the updated policy: ${policy.name}`,
        type: 'WARNING',
        link: '/employee/compliance'
      });
      sentCount++;
    }

    return res.status(200).json({ success: true, message: `Reminder sent to ${sentCount} employees.` });
  } catch (err) { next(err); }
};

// (ensureDefaultRoles is now imported from src/utils/roleSeeder.js)

const getRoles = async (req, res, next) => {
  try {
    await ensureDefaultRoles();
    const customRoles = await prisma.customRole.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { users: true }
        }
      }
    });
    const mapped = customRoles.map(r => {
      let parsedPerms = r.permissions || {};
      if (typeof parsedPerms === 'string') {
        try { parsedPerms = JSON.parse(parsedPerms); } catch (e) { }
      }
      return {
        ...r,
        permissions: parsedPerms,
        assignedUsersCount: r._count?.users || 0
      };
    });

    return res.status(200).json({ success: true, data: mapped });
  } catch (err) { next(err); }
};

const createRole = async (req, res, next) => {
  try {
    const { name, description, isCustom, permissions, inheritsFrom, landingPage, assignedUsers } = req.body;

    const role = await prisma.$transaction(async (tx) => {
      const createdRole = await tx.customRole.create({
        data: {
          name,
          description,
          isCustom: isCustom ?? true,
          permissions: typeof permissions === 'string' ? permissions : JSON.stringify(permissions || {}),
          inheritsFrom: inheritsFrom || 'EMPLOYEE',
          landingPage: landingPage || null,
          createdById: req.user?.userId
        }
      });

      if (Array.isArray(assignedUsers) && assignedUsers.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: assignedUsers } },
          data: { customRoleId: createdRole.id }
        });
      }

      return createdRole;
    });

    if (req.user?.userId) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'CREATE_ROLE',
          details: `Created custom role: ${name}`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    let parsedPerms = role.permissions;
    if (typeof parsedPerms === 'string') {
      try { parsedPerms = JSON.parse(parsedPerms); } catch (e) { }
    }
    return res.status(201).json({ success: true, data: { ...role, permissions: parsedPerms } });
  } catch (err) { next(err); }
};

const updateRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, isCustom, permissions, inheritsFrom, landingPage, status, assignedUsers } = req.body;

    const existing = await prisma.customRole.findUnique({ where: { id } });

    const role = await prisma.$transaction(async (tx) => {
      const updatedRole = await tx.customRole.update({
        where: { id },
        data: {
          name,
          description,
          isCustom,
          permissions: permissions ? (typeof permissions === 'string' ? permissions : JSON.stringify(permissions)) : undefined,
          inheritsFrom,
          landingPage,
          status,
          updatedById: req.user?.userId,
          permissionVersion: existing ? existing.permissionVersion + 1 : 1
        }
      });

      if (Array.isArray(assignedUsers)) {
        // 1. Remove this customRoleId from users who are no longer in the assignedUsers list
        await tx.user.updateMany({
          where: {
            customRoleId: id,
            id: { notIn: assignedUsers }
          },
          data: { customRoleId: null }
        });

        // 2. Add this customRoleId to users in the assignedUsers list
        if (assignedUsers.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: assignedUsers } },
            data: { customRoleId: id }
          });
        }
      }

      return updatedRole;
    });

    if (req.user?.userId) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE_ROLE',
          details: `Updated custom role: ${role.name}`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    let parsedPerms = role.permissions;
    if (typeof parsedPerms === 'string') {
      try { parsedPerms = JSON.parse(parsedPerms); } catch (e) { }
    }
    return res.status(200).json({ success: true, data: { ...role, permissions: parsedPerms } });
  } catch (err) { next(err); }
};

const deleteRole = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Hard delete the custom role from the DB. Prisma's onDelete: SetNull will clear customRoleId on affected users automatically.
    const role = await prisma.customRole.delete({
      where: { id }
    });

    if (req.user?.userId) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'DELETE_ROLE',
          details: `Deleted custom role: ${role.name}`,
          ipAddress: req.ip || req.socket.remoteAddress
        }
      });
    }

    return res.status(200).json({ success: true, message: 'Role deleted.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// HOLIDAYS
// ─────────────────────────────────────────

const getHolidays = async (req, res, next) => {
  try {
    const holidays = await prisma.holiday.findMany({ orderBy: { date: 'asc' } });
    return res.status(200).json({ success: true, data: holidays });
  } catch (err) { next(err); }
};

const createHoliday = async (req, res, next) => {
  try {
    const holiday = await prisma.holiday.create({ data: req.body });
    return res.status(201).json({ success: true, data: holiday });
  } catch (err) { next(err); }
};

const updateHoliday = async (req, res, next) => {
  try {
    const { id } = req.params;
    const holiday = await prisma.holiday.update({
      where: { id },
      data: req.body
    });
    return res.status(200).json({ success: true, data: holiday });
  } catch (err) { next(err); }
};

const deleteHoliday = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.holiday.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Holiday deleted.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// BENEFIT PLANS
// ─────────────────────────────────────────

const getBenefitPlans = async (req, res, next) => {
  try {
    const plans = await prisma.benefitPlan.findMany({
      orderBy: { name: 'asc' },
      include: {
        employeeBenefits: true
      }
    });
    return res.status(200).json({ success: true, data: plans });
  } catch (err) { next(err); }
};

const createBenefitPlan = async (req, res, next) => {
  try {
    const plan = await prisma.benefitPlan.create({ data: req.body });

    try {
      const { createNotification } = require('../utils/notificationHelper');
      const users = await prisma.user.findMany({ where: { role: 'EMPLOYEE' } });
      for (const u of users) {
        await createNotification({
          userId: u.id,
          title: 'Benefits Enrollment',
          message: `${plan.name} enrollment is now open. Enrollment ends soon.`,
          type: 'INFO',
          link: '/employee/benefits'
        });
      }
    } catch (notifErr) {
      console.error('Failed to trigger benefits enrollment notifications:', notifErr);
    }

    return res.status(201).json({ success: true, data: plan });
  } catch (err) { next(err); }
};

const updateBenefitPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const plan = await prisma.benefitPlan.update({
      where: { id },
      data: req.body
    });
    return res.status(200).json({ success: true, data: plan });
  } catch (err) { next(err); }
};

const deleteBenefitPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.benefitPlan.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Benefit plan deleted.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// AI CENTER
// ─────────────────────────────────────────

const getAiModules = async (req, res, next) => {
  try {
    const modules = await prisma.aiModule.findMany({ orderBy: { name: 'asc' } });
    const mapped = modules.map(m => ({
      ...m,
      settings: JSON.parse(m.settings || '{}')
    }));
    return res.status(200).json({ success: true, data: mapped });
  } catch (err) { next(err); }
};

const updateAiModule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, desc, status, confidence, settings } = req.body;
    const mod = await prisma.aiModule.update({
      where: { id },
      data: {
        name,
        desc,
        status,
        confidence,
        settings: settings ? JSON.stringify(settings) : undefined
      }
    });
    return res.status(200).json({ success: true, data: { ...mod, settings: JSON.parse(mod.settings) } });
  } catch (err) { next(err); }
};

const getAiLogs = async (req, res, next) => {
  try {
    const logs = await prisma.aiLog.findMany({ orderBy: { timestamp: 'desc' }, take: 50 });
    return res.status(200).json({ success: true, data: logs });
  } catch (err) { next(err); }
};

const createAiLog = async (req, res, next) => {
  try {
    const log = await prisma.aiLog.create({ data: req.body });
    return res.status(201).json({ success: true, data: log });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// SYSTEM INTEGRATIONS
// ─────────────────────────────────────────

const getIntegrations = async (req, res, next) => {
  try {
    const integrations = await prisma.integration.findMany({ orderBy: { name: 'asc' } });
    return res.status(200).json({ success: true, data: integrations });
  } catch (err) { next(err); }
};

const createIntegration = async (req, res, next) => {
  try {
    const integration = await prisma.integration.create({ data: req.body });
    return res.status(201).json({ success: true, data: integration });
  } catch (err) { next(err); }
};

const updateIntegration = async (req, res, next) => {
  try {
    const { id } = req.params;
    const integration = await prisma.integration.update({
      where: { id },
      data: req.body
    });
    return res.status(200).json({ success: true, data: integration });
  } catch (err) { next(err); }
};

const deleteIntegration = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.integration.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Integration deleted.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// BILLING & INVOICES
// ─────────────────────────────────────────

const getBillingPlan = async (req, res, next) => {
  try {
    let plan = await prisma.billingPlan.findFirst();
    if (!plan) {
      plan = await prisma.billingPlan.create({
        data: {
          name: "Professional",
          price: 29,
          cycle: "Monthly",
          users: 42,
          addons: JSON.stringify(["Premium Support"])
        }
      });
    }
    return res.status(200).json({ success: true, data: { ...plan, addons: JSON.parse(plan.addons) } });
  } catch (err) { next(err); }
};

const updateBillingPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, price, cycle, users, addons } = req.body;
    const plan = await prisma.billingPlan.update({
      where: { id },
      data: {
        name,
        price,
        cycle,
        users,
        addons: addons ? JSON.stringify(addons) : undefined
      }
    });
    return res.status(200).json({ success: true, data: { ...plan, addons: JSON.parse(plan.addons) } });
  } catch (err) { next(err); }
};

const getInvoices = async (req, res, next) => {
  try {
    let invoices = await prisma.invoice.findMany({ orderBy: { date: 'desc' } });
    if (invoices.length === 0) {
      await prisma.invoice.createMany({
        data: [
          { amount: '4,280.00', method: 'Visa •••• 4242', status: 'Paid', date: new Date('2026-10-01') },
          { amount: '4,280.00', method: 'Visa •••• 4242', status: 'Paid', date: new Date('2026-09-01') },
          { amount: '4,200.00', method: 'Visa •••• 4242', status: 'Paid', date: new Date('2026-08-01') },
          { amount: '4,200.00', method: 'Visa •••• 4242', status: 'Refunded', date: new Date('2026-07-01') },
        ]
      });
      invoices = await prisma.invoice.findMany({ orderBy: { date: 'desc' } });
    }
    return res.status(200).json({ success: true, data: invoices });
  } catch (err) { next(err); }
};

const createInvoice = async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.create({ data: req.body });
    return res.status(201).json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

const updateInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const invoice = await prisma.invoice.update({
      where: { id },
      data: req.body
    });
    return res.status(200).json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

const deleteInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.invoice.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Invoice deleted.' });
  } catch (err) { next(err); }
};

const exportInvoices = async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({ orderBy: { date: 'desc' } });

    // CSV Header
    let csv = 'ID,Date,Amount,Method,Status\n';

    invoices.forEach(inv => {
      const row = [
        inv.id,
        new Date(inv.date).toISOString().split('T')[0],
        `"${inv.amount}"`,
        `"${inv.method}"`,
        inv.status
      ];
      csv += row.join(',') + '\n';
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('invoices.csv');
    return res.status(200).send(csv);
  } catch (err) { next(err); }
};

// ATTENDANCE & LEAVES
const getAllAttendance = async (req, res, next) => {
  try {
    const logs = await prisma.attendanceLog.findMany({
      include: { user: { include: { employeeProfile: true } } },
      orderBy: { date: 'desc' }
    });
    return res.status(200).json({ success: true, data: logs });
  } catch (err) { next(err); }
};

const addManualAttendance = async (req, res, next) => {
  try {
    const { userId, date, clockIn, clockOut, status, mode, totalWorkedMin } = req.body;
    const log = await prisma.attendanceLog.create({
      data: {
        userId,
        date: new Date(date),
        clockIn: new Date(clockIn),
        clockOut: clockOut ? new Date(clockOut) : null,
        status: status || 'Present',
        mode: mode || 'Office',
        totalWorkedMin: totalWorkedMin || 0
      },
      include: { user: { include: { employeeProfile: true } } }
    });
    return res.status(201).json({ success: true, data: log });
  } catch (err) { next(err); }
};

const getAllLeaves = async (req, res, next) => {
  try {
    const leaves = await prisma.leaveRequest.findMany({
      include: { user: { include: { employeeProfile: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ success: true, data: leaves });
  } catch (err) { next(err); }
};

const reviewLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, adminComment, hrComment } = req.body;

    const leave = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Leave not found.' } });

    // --- GENERIC APPROVAL ENGINE INTEGRATION ---
    const orgId = req.user.organizationId;
    const workflowActive = await isWorkflowEnabled('LeaveRequest', orgId);

    if (workflowActive) {
      try {
        const action = status === 'REJECTED' ? 'REJECT' : 'APPROVE';
        const comment = adminComment || hrComment || '';
        const result = await processApproval('LeaveRequest', leave.id, req.user.userId, action, comment);

        let newLeaveStatus = 'MANAGER_APPROVED';
        if (result.finalized) {
          newLeaveStatus = action === 'REJECT' ? 'REJECTED' : 'APPROVED';
        } else {
          const nextRole = result.nextStepConfig?.approverRole?.toUpperCase() || '';
          if (nextRole === 'HR') {
            newLeaveStatus = 'MANAGER_APPROVED';
          } else if (nextRole === 'ADMIN') {
            newLeaveStatus = 'HR_APPROVED';
          } else {
            newLeaveStatus = 'Pending';
          }
        }

        const updatedLeave = await prisma.leaveRequest.update({
          where: { id: leave.id },
          data: { status: newLeaveStatus },
          include: { user: { include: { employeeProfile: true } } }
        });
        return res.status(200).json({ success: true, data: updatedLeave, message: `Leave ${action.toLowerCase()}d via Generic Engine.`, workflowResult: result });
      } catch (workflowErr) {
        if (workflowErr.message === "No pending approval found for this entity.") {
          console.warn(`[Approval Engine] Skipping generic approval for ${leave.id}:`, workflowErr.message);
          // Fallthrough to legacy logic
        } else {
          return res.status(400).json({ success: false, message: workflowErr.message });
        }
      }
    }

    // --- LEGACY LOGIC ---
    const updatedLeave = await prisma.leaveRequest.update({
      where: { id },
      data: { status },
      include: { user: { include: { employeeProfile: true } } }
    });
    return res.status(200).json({ success: true, data: updatedLeave });
  } catch (err) { next(err); }
};

// GET /api/admin/resignations
const getAdminResignations = async (req, res, next) => {
  try {
    const resignations = await prisma.exitLifecycle.findMany({
      where: { exitType: 'RESIGNATION' },
      include: {
        employee: {
          select: { id: true, employeeId: true, fullName: true, department: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ success: true, data: resignations });
  } catch (err) { next(err); }
};

// PATCH /api/admin/resignations/:id/override
const overrideResignation = async (req, res, next) => {
  try {
    const { status, adminComment } = req.body;
    const exitId = req.params.id;

    if (!['APPROVED', 'REJECTED_BY_HR', 'REJECTED_BY_MANAGER'].includes(status)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid status for admin override.' } });
    }

    const updated = await prisma.exitLifecycle.update({
      where: { id: exitId },
      data: {
        status,
        hrComment: adminComment || 'Admin Override',
        hrDecisionDate: new Date()
      }
    });

    return res.status(200).json({ success: true, data: updated, message: 'Resignation overridden by Admin.' });
  } catch (err) { next(err); }
};

module.exports = {
  getDashboardStats,
  getOrganization, createOrganization, updateOrganization,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getAllUsers, createUser, updateUser, changeUserRole, toggleUserActive, deleteUser,
  getAllPayslips, generatePayslip, markPayslipPaid,
  getAuditLogs,
  getPolicies, createPolicy, updatePolicy, deletePolicy,
  toggleArchivePolicy,
  renewPolicy,
  sendPolicyReminder,
  getRoles, createRole, updateRole, deleteRole,
  getHolidays, createHoliday, updateHoliday, deleteHoliday,
  getBenefitPlans, createBenefitPlan, updateBenefitPlan, deleteBenefitPlan,
  getAiModules, updateAiModule, getAiLogs, createAiLog,
  getIntegrations, createIntegration, updateIntegration, deleteIntegration,
  getBillingPlan, updateBillingPlan, getInvoices, createInvoice, updateInvoice, deleteInvoice, exportInvoices,
  getAllAttendance, addManualAttendance, getAllLeaves, reviewLeave,
  getAdminResignations, overrideResignation
};
