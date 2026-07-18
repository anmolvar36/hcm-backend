// ============================================================
// Manager Controller
// ============================================================
// Handles: Team view, Leave approvals, Task assignments, KPI tracking

const prisma = require('../config/prisma');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { isWorkflowEnabled, processApproval } = require('../services/approval.service');

// ─────────────────────────────────────────
// 1. GET MY TEAM  →  GET /api/manager/team
// ─────────────────────────────────────────
const getTeam = async (req, res, next) => {
  try {
    // Manager ka own profile find karo
    const managerProfile = await prisma.employeeProfile.findUnique({
      where: { userId: req.user.userId },
    });

    if (!managerProfile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Manager profile not found.' } });
    }

    // Us manager ke saare reports dhundo
    const team = await prisma.employeeProfile.findMany({
      where: { managerId: managerProfile.id },
      include: {
        department: true,
        user: { select: { email: true, isActive: true } },
        compensationProfile: true,
      },
    });

    return res.status(200).json({ success: true, data: team, meta: { total: team.length } });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 2. GET PENDING LEAVE REQUESTS  →  GET /api/manager/leaves
// ─────────────────────────────────────────
const getTeamLeaves = async (req, res, next) => {
  try {
    const orgId = req.user.organizationId || (await prisma.organization.findFirst({ select: { id: true } }))?.id;

    let whereClause = {};

    if (!['ADMIN', 'SUPERADMIN', 'HR'].includes(req.user.role)) {
      const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
      if (!managerProfile) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Manager profile not found.' } });

      const teamMembers = await prisma.employeeProfile.findMany({
        where: { managerId: managerProfile.id },
        select: { userId: true },
      });

      const userIds = teamMembers.map(m => m.userId);
      whereClause = { userId: { in: userIds } };
    } else {
      if (orgId) {
        whereClause = { user: { organizationId: orgId } };
      }
    }

    const leaves = await prisma.leaveRequest.findMany({
      where: whereClause,
      include: {
        user: {
          select: { email: true, employeeProfile: { select: { fullName: true, employeeId: true, avatarUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: leaves });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 3. APPROVE / REJECT LEAVE  →  PATCH /api/manager/leaves/:id
// ─────────────────────────────────────────
const reviewLeave = async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['MANAGER_APPROVED', 'APPROVED', 'REJECTED']),
      managerComment: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!leave) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Leave request not found.' } });

    if (leave.status !== 'PENDING' && leave.status !== 'MANAGER_APPROVED') {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_REVIEWED', message: 'This leave has already been reviewed.' } });
    }

    try {
      // --- GENERIC APPROVAL ENGINE INTEGRATION ---
      const orgId = req.user.organizationId; // Or fetch from user profile
      const workflowActive = await isWorkflowEnabled('LeaveRequest', orgId);

      if (workflowActive) {
        // We cannot just use processApproval from managerController because processApproval assumes it's the Generic Route where currentStep is validated.
        // Wait, the requirement says "Controllers should simply determine whether a custom workflow exists and delegate processing to the Approval Engine."
        // We can just call processApproval if they use the legacy endpoint.
        const action = parsed.data.status === 'REJECTED' ? 'REJECT' : 'APPROVE';
        const result = await processApproval('LeaveRequest', leave.id, req.user.userId, action, parsed.data.managerComment);
        
        // Also update the main LeaveRequest record status conditionally?
        // Wait, if it's generic, the main record isn't updated by generic engine right now (unless we add a webhook/hook system). 
        // For Phase 1, we should probably update the main record as well, or we just return the result.
        // Let's let the generic engine handle the ApprovalLogs, and we update the LeaveRequest status for fallback UI compatibility.
        const newLeaveStatus = result.finalized ? (action === 'REJECT' ? 'REJECTED' : 'APPROVED') : 'MANAGER_APPROVED';
        const updatedLeave = await prisma.leaveRequest.update({
          where: { id: leave.id },
          data: { status: newLeaveStatus, managerComment: parsed.data.managerComment },
        });

        return res.status(200).json({ success: true, data: updatedLeave, message: `Leave ${action.toLowerCase()}d via Generic Engine.`, workflowResult: result });
      }
    } catch (engineErr) {
      console.error('[Leave Workflow Fallback] Error in generic workflow, falling back to legacy:', engineErr);
    }
    // -------------------------------------------

    const updated = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status, managerComment: parsed.data.managerComment },
    });

    try {
      const { createNotification } = require('../utils/notificationHelper');
      await createNotification({
        userId: leave.userId,
        title: 'Leave Application Status',
        message: `Your leave request has been ${parsed.data.status.toLowerCase()}.`,
        type: parsed.data.status === 'APPROVED' ? 'SUCCESS' : 'WARNING',
        link: '/employee/leave'
      });
    } catch (notifErr) {
      console.error('Failed to trigger leave status notification:', notifErr);
    }

    return res.status(200).json({ success: true, data: updated, message: `Leave ${parsed.data.status.toLowerCase()}.` });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 4. ASSIGN TASK  →  POST /api/manager/tasks
// ─────────────────────────────────────────
const assignTask = async (req, res, next) => {
  try {
    const schema = z.object({
      employeeId: z.string(),
      title: z.string().min(3),
      description: z.string().optional(),
      priority: z.enum(['High', 'Medium', 'Low']).optional(),
      dueDate: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    const task = await prisma.task.create({
      data: {
        employeeId: parsed.data.employeeId,
        title: parsed.data.title,
        description: parsed.data.description,
        priority: parsed.data.priority || 'Medium',
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        status: 'Pending',
      },
    });

    try {
      const { createNotification } = require('../utils/notificationHelper');
      const empProfile = await prisma.employeeProfile.findUnique({
        where: { id: parsed.data.employeeId },
        select: { userId: true }
      });
      if (empProfile && empProfile.userId) {
        await createNotification({
          userId: empProfile.userId,
          title: 'New Task Assigned',
          message: `You have been assigned a new task: "${parsed.data.title}".`,
          type: 'INFO',
          link: '/employee/performance'
        });
      }
    } catch (notifErr) {
      console.error('Failed to trigger task assignment notification:', notifErr);
    }

    return res.status(201).json({ success: true, data: task, message: 'Task assigned successfully.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 5. GET ALL TASKS FOR TEAM  →  GET /api/manager/tasks
// ─────────────────────────────────────────
const getTeamTasks = async (req, res, next) => {
  try {
    const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    if (!managerProfile) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Manager profile not found.' } });

    const teamMembers = await prisma.employeeProfile.findMany({
      where: { managerId: managerProfile.id },
      select: { id: true },
    });

    const employeeIds = teamMembers.map(m => m.id);

    const tasks = await prisma.task.findMany({
      where: { employeeId: { in: employeeIds } },
      include: { employee: { select: { fullName: true, employeeId: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: tasks });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 6. UPDATE TASK STATUS  →  PATCH /api/manager/tasks/:id
// ─────────────────────────────────────────
const updateTask = async (req, res, next) => {
  try {
    const { status, description, priority, dueDate } = req.body;

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(description && { description }),
        ...(priority && { priority }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
      },
    });

    if (status && (status.toLowerCase() === 'completed' || status.toLowerCase() === 'done')) {
      try {
        const { createNotification } = require('../utils/notificationHelper');
        const taskWithManager = await prisma.task.findUnique({
          where: { id: updated.id },
          include: {
            employee: {
              include: {
                manager: true
              }
            }
          }
        });
        if (taskWithManager?.employee?.manager?.userId) {
          await createNotification({
            userId: taskWithManager.employee.manager.userId,
            title: 'Task Completed',
            message: `${taskWithManager.employee.fullName} completed task "${taskWithManager.title}".`,
            type: 'SUCCESS',
            link: '/manager/tasks'
          });
        }
      } catch (notifErr) {
        console.error('Failed to trigger task completed notification:', notifErr);
      }
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 7. GET TEAM KPI / PERFORMANCE  →  GET /api/manager/performance
// ─────────────────────────────────────────
const getTeamPerformance = async (req, res, next) => {
  try {
    const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    if (!managerProfile) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Manager profile not found.' } });

    const teamMembers = await prisma.employeeProfile.findMany({
      where: { managerId: managerProfile.id },
      select: { id: true, fullName: true, employeeId: true },
    });

    const employeeIds = teamMembers.map(m => m.id);

    const goals = await prisma.performanceGoal.findMany({
      where: { employeeId: { in: employeeIds } },
      include: { employee: { select: { fullName: true, employeeId: true } } },
    });

    return res.status(200).json({ success: true, data: goals });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 8. ADD PERFORMANCE GOAL  →  POST /api/manager/performance
// ─────────────────────────────────────────
const addPerformanceGoal = async (req, res, next) => {
  try {
    const schema = z.object({
      employeeId: z.string(),
      title: z.string().min(3),
      priority: z.enum(['High', 'Medium', 'Low']).optional(),
      deadline: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    const goal = await prisma.performanceGoal.create({
      data: {
        employeeId: parsed.data.employeeId,
        title: parsed.data.title,
        priority: parsed.data.priority || 'Medium',
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
        progress: 0,
      },
    });

    return res.status(201).json({ success: true, data: goal, message: 'Performance goal added.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 9. GET TEAM ATTENDANCE  →  GET /api/manager/attendance
// ─────────────────────────────────────────
const getTeamAttendance = async (req, res, next) => {
  try {
    const orgId = req.user.organizationId || (await prisma.organization.findFirst({ select: { id: true } }))?.id;

    let whereClause = {};

    if (!['ADMIN', 'SUPERADMIN', 'HR'].includes(req.user.role)) {
      const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
      if (!managerProfile) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Manager profile not found.' } });

      const teamMembers = await prisma.employeeProfile.findMany({
        where: { managerId: managerProfile.id },
        select: { userId: true },
      });

      const userIds = teamMembers.map(m => m.userId);
      whereClause = { userId: { in: userIds } };
    } else {
      if (orgId) {
        whereClause = { user: { organizationId: orgId } };
      }
    }

    const attendance = await prisma.attendanceLog.findMany({
      where: whereClause,
      include: { user: { select: { employeeProfile: { select: { fullName: true, employeeId: true } } } } },
      orderBy: { date: 'desc' },
    });

    return res.status(200).json({ success: true, data: attendance });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 9.5. ADD MANUAL ATTENDANCE ENTRY  →  POST /api/manager/attendance
// ─────────────────────────────────────────
const addManualAttendance = async (req, res, next) => {
  try {
    const schema = z.object({
      employeeProfileId: z.string(),
      date: z.string(),
      checkIn: z.string(), // e.g. "09:00"
      checkOut: z.string().optional(), // e.g. "18:00"
      status: z.enum(['Present', 'Late', 'On Leave', 'Absent']).optional().default('Present'),
      mode: z.enum(['Office', 'Remote', 'hybrid', 'Client Visit']).optional().default('Office'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    const { employeeProfileId, date, checkIn, checkOut, status, mode } = parsed.data;

    // Get the employee profile to retrieve userId
    const employee = await prisma.employeeProfile.findUnique({
      where: { id: employeeProfileId },
      select: { userId: true },
    });
    if (!employee) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found.' } });
    }

    // Parse time components
    const [inHours, inMins] = checkIn.split(':').map(Number);
    const clockInDate = new Date(date);
    clockInDate.setHours(inHours, inMins, 0, 0);

    let clockOutDate = null;
    let totalWorkedMin = 0;
    if (checkOut) {
      const [outHours, outMins] = checkOut.split(':').map(Number);
      clockOutDate = new Date(date);
      clockOutDate.setHours(outHours, outMins, 0, 0);
      totalWorkedMin = Math.max(0, Math.round((clockOutDate - clockInDate) / 1000 / 60));
    }

    const log = await prisma.attendanceLog.create({
      data: {
        userId: employee.userId,
        date: new Date(date),
        clockIn: clockInDate,
        clockOut: clockOutDate,
        totalWorkedMin,
        status,
        mode,
      },
      include: { user: { select: { employeeProfile: { select: { fullName: true, employeeId: true } } } } },
    });

    return res.status(201).json({ success: true, data: log, message: 'Attendance record created.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 10. ADD TEAM MEMBER  →  POST /api/manager/team
// ─────────────────────────────────────────
const addTeamMember = async (req, res, next) => {
  try {
    const schema = z.object({
      id: z.string().optional(),
      name: z.string().trim().min(2),
      email: z.string().trim().email(),
      role: z.string().trim().min(1),
      department: z.string().trim().min(1),
      phone: z.string().optional(),
      joinDate: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    const data = parsed.data;

    const managerProfile = await prisma.employeeProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true, user: { select: { organizationId: true } } },
    });
    if (!managerProfile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Manager profile not found.' } });
    }

    const orgId = managerProfile.user?.organizationId;

    if (data.id) {
      // Assign existing employee to this manager
      const updatedProfile = await prisma.employeeProfile.update({
        where: { id: data.id },
        data: { managerId: managerProfile.id },
        include: {
          department: true,
          user: { select: { email: true, role: true, isActive: true, status: true } }
        }
      });
      return res.status(200).json({ success: true, data: updatedProfile, message: 'Team member assigned.' });
    }

    // Otherwise, create a new user and profile (fallback if manual input is somehow allowed)
    const existingEmail = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingEmail) {
      return res.status(409).json({ success: false, error: { code: 'EMAIL_TAKEN', message: 'Email already exists.' } });
    }

    const department = await prisma.department.findFirst({
      where: { name: data.department },
      select: { id: true },
    });
    if (!department) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Selected department was not found.' } });
    }

    const empId = `EMP${Date.now()}`;
    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: 'EMPLOYEE',
        isActive: true,
        status: 'Active',
        organizationId: orgId,
        employeeProfile: {
          create: {
            employeeId: empId,
            fullName: data.name,
            phone: data.phone || null,
            joiningDate: data.joinDate ? new Date(data.joinDate) : new Date(),
            employmentType: 'Full-time',
            departmentId: department.id,
            managerId: managerProfile.id,
          },
        },
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        status: true,
        employeeProfile: {
          select: {
            id: true,
            fullName: true,
            employeeId: true,
            phone: true,
            joiningDate: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    return res.status(201).json({ success: true, data: user, message: 'Team member added.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 11. GET ORG EMPLOYEES (for dropdown)  →  GET /api/manager/org-employees
// Returns all employees in the manager's organization for the "Add Member" dropdown
// ─────────────────────────────────────────
const getOrgEmployees = async (req, res, next) => {
  try {
    const managerProfile = await prisma.employeeProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true, user: { select: { organizationId: true } } },
    });
    if (!managerProfile) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Manager profile not found.' } });
    }

    const orgId = managerProfile.user?.organizationId;

    // Fetch all employees in the same org — exclude those already reporting to this manager
    const employees = await prisma.employeeProfile.findMany({
      where: {
        user: { organizationId: orgId },
        id: { not: managerProfile.id },              // not self
        OR: [
          { managerId: null },
          { managerId: { not: managerProfile.id } }
        ]
      },
      select: {
        id: true,
        fullName: true,
        employeeId: true,
        phone: true,
        joiningDate: true,
        department: { select: { name: true } },
        user: { select: { email: true, role: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    return res.status(200).json({ success: true, data: employees });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 12. ADD TEAM LEAVE REQUEST  →  POST /api/manager/leaves
// Adds a leave request on behalf of a team member
// ─────────────────────────────────────────
const addTeamLeaveRequest = async (req, res, next) => {
  try {
    const schema = z.object({
      employeeId: z.string(), // employeeProfile.id
      leaveType: z.enum(['Sick Leave', 'Annual Leave', 'Casual Leave', 'Unpaid Leave']),
      startDate: z.string(),
      endDate: z.string(),
      reason: z.string().optional().default(''),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    const { employeeId, leaveType, startDate, endDate, reason } = parsed.data;

    const employee = await prisma.employeeProfile.findUnique({
      where: { id: employeeId },
      select: { userId: true },
    });
    if (!employee) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found.' } });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: employee.userId,
        leaveType,
        startDate: start,
        endDate: end,
        totalDays,
        reason,
        status: 'PENDING',
      },
    });

    return res.status(201).json({ success: true, data: leave, message: 'Leave request submitted successfully.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 12. GET TEAM REVIEWS  →  GET /api/manager/reviews
// ─────────────────────────────────────────
const getTeamReviews = async (req, res, next) => {
  try {
    const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    if (!managerProfile) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Manager profile not found.' } });

    const teamMembers = await prisma.employeeProfile.findMany({
      where: { managerId: managerProfile.id },
      select: { id: true },
    });

    const employeeIds = teamMembers.map(m => m.id);

    const reviews = await prisma.performanceReview.findMany({
      where: { employeeId: { in: employeeIds } },
      include: { 
        employee: { 
          select: { 
            fullName: true, 
            id: true,
            user: { select: { role: true } }
          } 
        } 
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: reviews });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 13. CREATE TEAM REVIEW  →  POST /api/manager/reviews
// ─────────────────────────────────────────
const createTeamReview = async (req, res, next) => {
  try {
    const schema = z.object({
      employeeId: z.string(),
      period: z.string(),
      rating: z.string(),
      text: z.string(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    const reviewerName = managerProfile ? managerProfile.fullName : 'Manager';

    const review = await prisma.performanceReview.create({
      data: {
        employeeId: parsed.data.employeeId,
        period: parsed.data.period,
        reviewer: reviewerName,
        rating: parsed.data.rating,
        text: parsed.data.text,
      },
    });

    return res.status(201).json({ success: true, data: review, message: 'Review created successfully.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 14. UPDATE TEAM REVIEW  →  PATCH /api/manager/reviews/:id
// ─────────────────────────────────────────
const updateTeamReview = async (req, res, next) => {
  try {
    const { period, rating, text } = req.body;

    const updated = await prisma.performanceReview.update({
      where: { id: req.params.id },
      data: {
        ...(period && { period }),
        ...(rating && { rating: rating.toString() }),
        ...(text && { text }),
      },
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 15. REQUEST SALARY INCREMENT (ON BEHALF OF EMPLOYEE)  →  POST /api/manager/increments
// ─────────────────────────────────────────
const requestSalaryIncrement = async (req, res, next) => {
  try {
    const schema = z.object({
      employeeId: z.string(), // This is the employeeProfile id
      requestedSalary: z.number().positive(),
      effectiveDate: z.string(),
      reason: z.string().optional().default('')
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    const { employeeId, requestedSalary, effectiveDate, reason } = parsed.data;

    const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    if (!managerProfile) return res.status(404).json({ success: false, message: 'Manager profile not found.' });

    const employee = await prisma.employeeProfile.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });
    
    if (employee.managerId !== managerProfile.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You are not this employee\'s manager.' });
    }

    const request = await prisma.salaryIncrementRequest.create({
      data: {
        employeeId: employee.id,
        requestedSalary,
        reason,
        effectiveDate: new Date(effectiveDate),
        status: 'ManagerApproved' // Auto-approve manager's own request so it goes to HR
      }
    });

    return res.status(201).json({ success: true, data: request, message: 'Salary increment request created and sent to HR.' });
  } catch (err) { next(err); }
};

const getIncrementRequests = async (req, res, next) => {
  try {
    const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    if (!managerProfile) return res.status(404).json({ success: false, message: 'Manager profile not found.' });

    const requests = await prisma.salaryIncrementRequest.findMany({
      where: {
        employee: {
          managerId: managerProfile.id
        }
      },
      include: {
        employee: {
          select: {
            fullName: true,
            employeeId: true,
            avatarUrl: true,
            compensationProfile: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ success: true, data: requests });
  } catch (err) { next(err); }
};

const approveIncrementRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    if (!managerProfile) return res.status(404).json({ success: false, message: 'Manager profile not found.' });

    const request = await prisma.salaryIncrementRequest.findUnique({
      where: { id },
      include: { employee: true }
    });

    if (!request) return res.status(404).json({ success: false, message: 'Increment request not found.' });
    if (request.employee.managerId !== managerProfile.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You are not this employee\'s manager.' });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({ success: false, message: `Request is already ${request.status.toLowerCase()}` });
    }

    const updatedRequest = await prisma.salaryIncrementRequest.update({
      where: { id },
      data: { status: 'ManagerApproved' }
    });

    // ── Notify the employee that their manager approved ──
    try {
      const { createNotification } = require('../utils/notificationHelper');
      await createNotification({
        userId: request.employee.userId,
        title: 'Increment Approved by Manager',
        message: `Your salary increment request has been approved by your manager and forwarded to HR for final review.`,
        type: 'SUCCESS',
        link: '/employee/compensation'
      });
    } catch (notifErr) {
      console.error('Failed to send manager approval notification:', notifErr);
    }

    return res.status(200).json({ success: true, data: updatedRequest, message: 'Increment request approved by manager, pending HR review.' });
  } catch (err) { next(err); }
};

const rejectIncrementRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    if (!managerProfile) return res.status(404).json({ success: false, message: 'Manager profile not found.' });

    const request = await prisma.salaryIncrementRequest.findUnique({
      where: { id },
      include: { employee: true }
    });

    if (!request) return res.status(404).json({ success: false, message: 'Increment request not found.' });
    if (request.employee.managerId !== managerProfile.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You are not this employee\'s manager.' });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({ success: false, message: `Request is already ${request.status.toLowerCase()}` });
    }

    const updatedRequest = await prisma.salaryIncrementRequest.update({
      where: { id },
      data: { status: 'Rejected' }
    });

    // ── Notify the employee that their manager rejected ──
    try {
      const { createNotification } = require('../utils/notificationHelper');
      await createNotification({
        userId: request.employee.userId,
        title: 'Increment Request Rejected',
        message: `Your salary increment request has been rejected by your manager.`,
        type: 'ALERT',
        link: '/employee/compensation'
      });
    } catch (notifErr) {
      console.error('Failed to send manager rejection notification:', notifErr);
    }

    return res.status(200).json({ success: true, data: updatedRequest, message: 'Increment request rejected.' });
  } catch (err) { next(err); }
};

// GET /api/manager/resignations
const getResignations = async (req, res, next) => {
  try {
    const managerProfile = await prisma.employeeProfile.findUnique({
      where: { userId: req.user.userId }
    });
    if (!managerProfile) return res.status(404).json({ success: false, error: { message: 'Manager profile not found.' } });

    const resignations = await prisma.exitLifecycle.findMany({
      where: {
        employee: { managerId: managerProfile.id },
        exitType: 'RESIGNATION'
      },
      include: {
        employee: { select: { fullName: true, employeeId: true, avatarUrl: true, department: true } }
      },
      orderBy: { submissionDate: 'desc' }
    });

    return res.status(200).json({ success: true, data: resignations });
  } catch (err) { next(err); }
};

// PATCH /api/manager/resignations/:id
const reviewResignation = async (req, res, next) => {
  try {
    const { status, managerComment } = req.body;
    const exitId = req.params.id;

    if (!['PENDING_HR_APPROVAL', 'REJECTED_BY_MANAGER'].includes(status)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid status for manager review.' } });
    }

    const managerProfile = await prisma.employeeProfile.findUnique({
      where: { userId: req.user.userId }
    });

    const exit = await prisma.exitLifecycle.findUnique({
      where: { id: exitId },
      include: { employee: true }
    });

    if (!exit || exit.employee.managerId !== managerProfile.id) {
      return res.status(404).json({ success: false, error: { message: 'Resignation not found or unauthorized.' } });
    }

    const updated = await prisma.exitLifecycle.update({
      where: { id: exitId },
      data: {
        status,
        managerId: managerProfile.id,
        managerComment,
        managerDecisionDate: new Date()
      }
    });

    // Notify HR if approved, notify employee if rejected
    const { createNotification } = require('../utils/notificationHelper');
    if (status === 'PENDING_HR_APPROVAL') {
      const hrUsers = await prisma.user.findMany({ where: { role: { in: ['HR', 'ADMIN'] } } });
      for (const hr of hrUsers) {
        await createNotification({
          userId: hr.id,
          title: 'Resignation Approved by Manager',
          message: `${exit.employee.fullName} resignation requires HR approval.`,
          type: 'INFO',
          link: '/hr/offboarding'
        });
      }
    } else if (status === 'REJECTED_BY_MANAGER') {
      await createNotification({
        userId: exit.employee.userId,
        title: 'Resignation Rejected',
        message: `Your resignation request was rejected by your manager.`,
        type: 'WARNING',
        link: '/employee/dashboard'
      });
    }

    return res.status(200).json({ success: true, data: updated, message: 'Resignation reviewed successfully.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 16. GET MANAGER REIMBURSEMENTS  →  GET /api/manager/reimbursements
// ─────────────────────────────────────────
const getManagerReimbursements = async (req, res, next) => {
  try {
    const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    if (!managerProfile) return res.status(404).json({ success: false, error: { message: 'Manager profile not found.' } });

    const claims = await prisma.benefitClaim.findMany({
      where: {
        employee: { managerId: managerProfile.id }
      },
      include: {
        employee: { select: { fullName: true, department: { select: { name: true } }, employeeId: true } }
      },
      orderBy: { claimedAt: 'desc' }
    });

    return res.status(200).json({ success: true, data: claims });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 17. REVIEW MANAGER REIMBURSEMENT  →  PATCH /api/manager/reimbursements/:id/review
// ─────────────────────────────────────────
const reviewManagerReimbursement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, comment } = req.body; // status: 'Approved', 'Rejected'
    
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid status' } });
    }

    const managerProfile = await prisma.employeeProfile.findUnique({ where: { userId: req.user.userId } });
    if (!managerProfile) return res.status(404).json({ success: false, error: { message: 'Manager profile not found.' } });

    const claim = await prisma.benefitClaim.findUnique({ where: { id }, include: { employee: true } });
    if (!claim) return res.status(404).json({ success: false, error: { message: 'Claim not found.' } });
    if (claim.employee.managerId !== managerProfile.id) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized to review this claim.' } });
    }

    const overallStatus = status === 'Approved' ? 'Pending Final Approval' : 'Rejected by Manager';
    
    let history = [];
    if (claim.approvalHistory) {
      try { history = JSON.parse(claim.approvalHistory); } catch(e) {}
    }
    history.push({
      action: status === 'Approved' ? 'Manager Approved' : 'Manager Rejected',
      actor: managerProfile.fullName,
      date: new Date().toISOString(),
      comment: comment || ''
    });

    const updatedClaim = await prisma.benefitClaim.update({
      where: { id },
      data: {
        managerStatus: status,
        managerComment: comment,
        managerApprovedAt: new Date(),
        overallStatus,
        approvalHistory: JSON.stringify(history)
      }
    });

    // Notification to Employee
    await prisma.notification.create({
      data: {
        userId: claim.employee.userId,
        type: 'INFO',
        title: 'Reimbursement Claim Update',
        message: `Your claim for ${claim.title} was ${status.toLowerCase()} by your manager.`,
        isRead: false
      }
    });

    // Notify final approvers if approved
    if (status === 'Approved') {
      const settings = await prisma.globalSettings.findUnique({ where: { id: 'global-settings' } });
      const finalRole = settings ? settings.reimbursementFinalApprovalRole : 'ADMIN';
      const finalApprovers = await prisma.user.findMany({ where: { role: finalRole } });
      for (const approver of finalApprovers) {
        await prisma.notification.create({
          data: {
            userId: approver.id,
            type: 'INFO',
            title: 'New Reimbursement Pending Final Approval',
            message: `${claim.employee.fullName}'s claim for ${claim.title} requires your approval.`,
            isRead: false
          }
        });
      }
    }

    return res.status(200).json({ success: true, data: updatedClaim, message: `Claim ${status.toLowerCase()} successfully.` });
  } catch (err) { next(err); }
};

module.exports = {
  getTeam, addTeamMember,
  getTeamLeaves, reviewLeave,
  assignTask, getTeamTasks, updateTask,
  getTeamPerformance, addPerformanceGoal,
  getTeamAttendance, addManualAttendance,
  getOrgEmployees,
  addTeamLeaveRequest,
  getTeamReviews, createTeamReview, updateTeamReview,
  getIncrementRequests, approveIncrementRequest, rejectIncrementRequest,
  getResignations, reviewResignation,
  getManagerReimbursements,
  reviewManagerReimbursement,
  requestSalaryIncrement
};
