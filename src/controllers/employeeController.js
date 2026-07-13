// ============================================================
// Employee Controller
// ============================================================
// Handles: Profile, Attendance (Clock In/Out), Leave, Payslips, Documents, Tickets

const prisma = require('../config/prisma');
const { z } = require('zod');

// ─────────────────────────────────────────
// HELPER: Auto-provision Employee Profile
// ─────────────────────────────────────────
const getOrCreateProfile = async (userId) => {
  let profile = await prisma.employeeProfile.findUnique({
    where: { userId },
    include: { department: true, manager: { select: { fullName: true, employeeId: true } }, user: { select: { email: true, role: true } } },
  });
  if (!profile) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found in database');
    }
    profile = await prisma.employeeProfile.create({
      data: {
        userId,
        fullName: user.email ? user.email.split('@')[0] : 'New Employee',
        employeeId: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
      },
      include: { department: true, manager: { select: { fullName: true, employeeId: true } }, user: { select: { email: true, role: true } } },
    });
  }
  return profile;
};

// ─────────────────────────────────────────
// 1. GET PROFILE  →  GET /api/employee/profile
// ─────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.user.userId);
    return res.status(200).json({ success: true, data: profile });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 2. UPDATE PROFILE  →  PUT /api/employee/profile
// ─────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const {
      fullName, phone, gender, bloodGroup, address, avatarUrl,
      emergencyName, emergencyPhone, emergencyRelation, dob, bio,
      language, timezone, dateFormat, emailNotif, pushNotif, weeklySummary
    } = req.body;

    const updated = await prisma.employeeProfile.update({
      where: { userId: req.user.userId },
      data: {
        fullName,
        phone,
        gender,
        bloodGroup,
        address,
        avatarUrl,
        emergencyName,
        emergencyPhone,
        emergencyRelation,
        dob: dob ? new Date(dob) : null,
        bio,
        language,
        timezone,
        dateFormat,
        emailNotif: emailNotif !== undefined ? Boolean(emailNotif) : undefined,
        pushNotif: pushNotif !== undefined ? Boolean(pushNotif) : undefined,
        weeklySummary: weeklySummary !== undefined ? Boolean(weeklySummary) : undefined
      },
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 3. CLOCK IN  →  POST /api/employee/attendance/clock-in
// ─────────────────────────────────────────
const clockIn = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check: already has an active clock-in session? (No date check to handle night shifts/timezones safely)
    const existing = await prisma.attendanceLog.findFirst({
      where: { userId: req.user.userId, clockOut: null },
    });

    if (existing) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_CLOCKED_IN', message: 'You are already clocked in. Please clock out of your active session first.' } });
    }

    const log = await prisma.attendanceLog.create({
      data: {
        userId: req.user.userId,
        date: today,
        clockIn: new Date(),
        mode: req.body.mode || 'Office',
        status: 'Present',
      },
    });

    return res.status(201).json({ success: true, data: log, message: 'Clocked in successfully.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 4. CLOCK OUT  →  POST /api/employee/attendance/clock-out
// ─────────────────────────────────────────
const clockOut = async (req, res, next) => {
  try {
    const activeLog = await prisma.attendanceLog.findFirst({
      where: { userId: req.user.userId, clockOut: null },
    });

    if (!activeLog) {
      return res.status(400).json({ success: false, error: { code: 'NOT_CLOCKED_IN', message: 'You do not have an active work session to clock out of.' } });
    }

    const clockOutTime = new Date();
    const workedMs = clockOutTime - new Date(activeLog.clockIn);
    const workedMin = Math.floor(workedMs / 60000);

    const updated = await prisma.attendanceLog.update({
      where: { id: activeLog.id },
      data: { clockOut: clockOutTime, totalWorkedMin: workedMin },
    });

    return res.status(200).json({ success: true, data: updated, message: 'Clocked out successfully.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 5. GET ATTENDANCE HISTORY  →  GET /api/employee/attendance
// ─────────────────────────────────────────
const getAttendance = async (req, res, next) => {
  try {
    const logs = await prisma.attendanceLog.findMany({
      where: { userId: req.user.userId },
      orderBy: { date: 'desc' },
      take: 30, // last 30 records
    });

    return res.status(200).json({ success: true, data: logs });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 6. GET LEAVES  →  GET /api/employee/leaves
// ─────────────────────────────────────────
const getLeaves = async (req, res, next) => {
  try {
    const leaves = await prisma.leaveRequest.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: leaves });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 7. APPLY LEAVE  →  POST /api/employee/leaves
// ─────────────────────────────────────────
const applyLeave = async (req, res, next) => {
  try {
    const schema = z.object({
      leaveType: z.enum(['Sick Leave', 'Annual Leave', 'Casual Leave', 'Unpaid Leave']),
      startDate: z.string(),
      endDate: z.string(),
      totalDays: z.number().min(1),
      reason: z.string().optional(),
      emergencyContact: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: req.user.userId,
        ...parsed.data,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        status: 'PENDING',
      },
    });

    try {
      const { createNotification } = require('../utils/notificationHelper');
      const empProfile = await prisma.employeeProfile.findUnique({
        where: { userId: req.user.userId },
        include: { manager: true }
      });
      if (empProfile && empProfile.manager?.userId) {
        await createNotification({
          userId: empProfile.manager.userId,
          title: 'Leave Approval Pending',
          message: `${empProfile.fullName} requested ${parsed.data.totalDays} days of ${parsed.data.leaveType}.`,
          type: 'WARNING',
          link: '/manager/leave'
        });
      }
    } catch (notifErr) {
      console.error('Failed to trigger leave application notification:', notifErr);
    }

    return res.status(201).json({ success: true, data: leave, message: 'Leave request submitted.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 7b. CANCEL LEAVE  →  DELETE /api/employee/leaves/:id
// ─────────────────────────────────────────
const cancelLeave = async (req, res, next) => {
  try {
    const leaveId = req.params.id;
    const leave = await prisma.leaveRequest.findUnique({ where: { id: leaveId } });

    if (!leave) {
      return res.status(404).json({ success: false, error: { message: 'Leave not found' } });
    }

    if (leave.userId !== req.user.userId) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized' } });
    }

    if (leave.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: { message: 'Only pending leaves can be cancelled' } });
    }

    await prisma.leaveRequest.delete({ where: { id: leaveId } });

    return res.status(200).json({ success: true, message: 'Leave request cancelled' });
  } catch (err) { next(err); }
};


// ─────────────────────────────────────────
// 8. GET PAYSLIPS  →  GET /api/employee/payslips
// ─────────────────────────────────────────
const getPayslips = async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.user.userId);

    const payslips = await prisma.payslip.findMany({
      where: { employeeId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: payslips });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 9. GET PERFORMANCE GOALS  →  GET /api/employee/performance
// ─────────────────────────────────────────
const getPerformance = async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.user.userId);

    const goals = await prisma.performanceGoal.findMany({
      where: { employeeId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    const skills = await prisma.employeeSkill.findMany({
      where: { employeeId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    const reviews = await prisma.performanceReview.findMany({
      where: { employeeId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    // Seed mock reviews if none exist for demo
    if (reviews.length === 0) {
      await prisma.performanceReview.create({
        data: {
          employeeId: profile.id,
          period: 'Q3 2026',
          reviewer: 'Sarah Johnson',
          rating: '4.9/5.0',
          text: 'Exceptional ownership on the design system rollout. A true culture catalyst.'
        }
      });
      await prisma.performanceReview.create({
        data: {
          employeeId: profile.id,
          period: 'Q2 2026',
          reviewer: 'Sarah Johnson',
          rating: '4.8/5.0',
          text: 'Quality output is industry-leading. Great focus on performance KPIs.'
        }
      });
      reviews.push(
        { period: 'Q3 2026', reviewer: 'Sarah Johnson', rating: '4.9/5.0', text: 'Exceptional ownership on the design system rollout. A true culture catalyst.' },
        { period: 'Q2 2026', reviewer: 'Sarah Johnson', rating: '4.8/5.0', text: 'Quality output is industry-leading. Great focus on performance KPIs.' }
      );
    }

    // Seed mock skills if none exist
    if (skills.length === 0) {
      await prisma.employeeSkill.createMany({
        data: [
          { employeeId: profile.id, name: 'React', level: 90 },
          { employeeId: profile.id, name: 'Node.js', level: 85 },
          { employeeId: profile.id, name: 'TypeScript', level: 80 }
        ]
      });
      skills.push(
        { name: 'React', level: 90 },
        { name: 'Node.js', level: 85 },
        { name: 'TypeScript', level: 80 }
      );
    }

    return res.status(200).json({ success: true, data: { goals, skills, reviews } });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 10. GET SUPPORT TICKETS  →  GET /api/employee/tickets
// ─────────────────────────────────────────
const getTickets = async (req, res, next) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.user.userId },
      include: {
        messages: {
          include: {
            sender: {
              select: {
                email: true,
                role: true,
                employeeProfile: { select: { fullName: true } }
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: tickets });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 11. CREATE TICKET  →  POST /api/employee/tickets
// ─────────────────────────────────────────
const createTicket = async (req, res, next) => {
  try {
    const schema = z.object({
      subject: z.string().min(3),
      category: z.string(),
      priority: z.enum(['High', 'Medium', 'Low']),
      description: z.string().min(5),
      attachmentBase64: z.string().optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    let attachmentUrl = null;
    if (parsed.data.attachmentBase64) {
      const fs = require('fs');
      const path = require('path');
      const base64Data = parsed.data.attachmentBase64.replace(/^data:.*;base64,/, "");
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const filename = `${Date.now()}_attachment.png`;
      const uploadPath = path.join(__dirname, '../../public/uploads', filename);
      fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
      fs.writeFileSync(uploadPath, fileBuffer);
      attachmentUrl = `http://localhost:5000/uploads/${filename}`;
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: req.user.userId,
        subject: parsed.data.subject,
        category: parsed.data.category,
        priority: parsed.data.priority,
        messages: {
          create: {
            senderId: req.user.userId,
            text: parsed.data.description,
            attachmentUrl,
          },
        },
      },
      include: { messages: true },
    });

    return res.status(201).json({ success: true, data: ticket, message: 'Support ticket created.' });
  } catch (err) { next(err); }
};

const replyTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text, attachmentBase64 } = req.body;

    if (!text && !attachmentBase64) {
      return res.status(400).json({ success: false, error: { message: 'Reply text or attachment is required' } });
    }

    let attachmentUrl = null;
    if (attachmentBase64) {
      const fs = require('fs');
      const path = require('path');
      const base64Data = attachmentBase64.replace(/^data:.*;base64,/, "");
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const filename = `${Date.now()}_attachment.png`;
      const uploadPath = path.join(__dirname, '../../public/uploads', filename);
      fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
      fs.writeFileSync(uploadPath, fileBuffer);
      attachmentUrl = `http://localhost:5000/uploads/${filename}`;
    }

    const msg = await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        senderId: req.user.userId,
        text: text || '',
        attachmentUrl
      },
      include: {
        sender: {
          select: {
            email: true,
            role: true,
            employeeProfile: { select: { fullName: true } }
          }
        }
      }
    });

    return res.status(201).json({ success: true, data: msg, message: 'Reply posted' });
  } catch (err) { next(err); }
};

const deleteTicketMessage = async (req, res, next) => {
  try {
    const { id, msgId } = req.params;
    const msg = await prisma.ticketMessage.findUnique({ where: { id: msgId } });

    if (!msg) {
      return res.status(404).json({ success: false, error: { message: 'Message not found' } });
    }

    if (msg.senderId !== req.user.userId) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized' } });
    }

    await prisma.ticketMessage.delete({ where: { id: msgId } });
    return res.status(200).json({ success: true, message: 'Message deleted' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 12. BENEFIT CLAIMS  →  GET /api/employee/benefits
// ─────────────────────────────────────────
const getBenefits = async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.user.userId);

    const claims = await prisma.benefitClaim.findMany({
      where: { employeeId: profile.id },
      orderBy: { claimedAt: 'desc' },
    });

    const enrolledPlans = await prisma.employeeBenefit.findMany({
      where: { employeeId: profile.id },
      include: { benefitPlan: true }
    });

    const availablePlans = await prisma.benefitPlan.findMany({
      where: { status: 'Active' }
    });

    return res.status(200).json({ success: true, data: { claims, enrolledPlans, availablePlans } });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 13. ENROLL IN BENEFIT PLAN → POST /api/employee/benefits/enroll
// ─────────────────────────────────────────
const enrollBenefitPlan = async (req, res, next) => {
  try {
    const { benefitPlanId } = req.body;
    if (!benefitPlanId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'benefitPlanId required' } });
    }
    const profile = await getOrCreateProfile(req.user.userId);
    const plan = await prisma.benefitPlan.findUnique({ where: { id: benefitPlanId } });
    if (!plan || plan.status !== 'Active') {
      return res.status(404).json({ success: false, error: { code: 'PLAN_NOT_FOUND', message: 'Benefit plan not found or inactive' } });
    }
    const existing = await prisma.employeeBenefit.findFirst({ where: { employeeId: profile.id, benefitPlanId } });
    if (existing) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_ENROLLED', message: 'Already enrolled in this benefit' } });
    }
    const amount = parseFloat(plan.empContribution) || parseFloat(plan.contribution) || 0;
    const [enrollment, deduction] = await prisma.$transaction([
      prisma.employeeBenefit.create({
        data: {
          employeeId: profile.id,
          benefitPlanId,
          status: 'Active',
        },
      }),
      prisma.employeeDeduction.create({
        data: {
          employeeId: profile.id,
          benefitPlanId,
          amount,
          description: `Deduction for benefit ${plan.name}`,
        },
      }),
    ]);
    return res.status(201).json({ success: true, data: { enrollment, deduction } });
  } catch (err) {
    next(err);
  }
};

const submitBenefitClaim = async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.user.userId);

    const { type, amount, date, description } = req.body;
    if (!type || !amount) {
      return res.status(400).json({ success: false, error: { message: 'Type and amount are required' } });
    }

    const claim = await prisma.benefitClaim.create({
      data: {
        employeeId: profile.id,
        title: type,
        provider: description || 'General',
        amount: parseFloat(amount) || 0,
        status: 'Pending',
        claimedAt: date ? new Date(date) : new Date()
      }
    });

    return res.status(201).json({ success: true, data: claim, message: 'Claim submitted' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 13. GET MY TASKS  →  GET /api/employee/tasks
// ─────────────────────────────────────────
const getTasks = async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.user.userId);

    const tasks = await prisma.task.findMany({
      where: { employeeId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: tasks });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 14. GET HOLIDAYS  →  GET /api/employee/holidays
// ─────────────────────────────────────────
const getHolidays = async (req, res, next) => {
  try {
    const holidays = await prisma.holiday.findMany({
      orderBy: { date: 'asc' }
    });
    return res.status(200).json({ success: true, data: holidays });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 15. GET ANNOUNCEMENTS  →  GET /api/employee/announcements
// ─────────────────────────────────────────
const getAnnouncements = async (req, res, next) => {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ success: true, data: announcements });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// 16. DOCUMENTS  →  GET /api/employee/documents, POST /api/employee/documents, DELETE /api/employee/documents/:id
// ─────────────────────────────────────────
const getDocuments = async (req, res, next) => {
  try {
    const docs = await prisma.document.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: docs });
  } catch (err) { next(err); }
};

const uploadDocument = async (req, res, next) => {
  try {
    const { name, category, size, fileBase64 } = req.body;
    if (!name || !category) {
      return res.status(400).json({ success: false, error: { message: 'Name and Category are required' } });
    }

    let url = 'http://localhost:5000/uploads/placeholder.pdf';
    if (fileBase64) {
      const fs = require('fs');
      const path = require('path');
      const base64Data = fileBase64.replace(/^data:.*;base64,/, "");
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const filename = `${Date.now()}_${name}`;
      const uploadPath = path.join(__dirname, '../../public/uploads', filename);
      fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
      fs.writeFileSync(uploadPath, fileBuffer);
      url = `http://localhost:5000/uploads/${filename}`;
    }

    const doc = await prisma.document.create({
      data: {
        userId: req.user.userId,
        name,
        category,
        size: size || '1.5 MB',
        url,
        date: new Date().toISOString().split('T')[0]
      }
    });

    return res.status(201).json({ success: true, data: doc, message: 'Document uploaded' });
  } catch (err) { next(err); }
};

const deleteDocument = async (req, res, next) => {
  try {
    const docId = req.params.id;
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) {
      return res.status(404).json({ success: false, error: { message: 'Document not found' } });
    }
    if (doc.userId !== req.user.userId) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized' } });
    }

    await prisma.document.delete({ where: { id: docId } });
    return res.status(200).json({ success: true, message: 'Document deleted' });
  } catch (err) { next(err); }
};

const updateGoalProgress = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { progress } = req.body;

    const updated = await prisma.performanceGoal.update({
      where: { id },
      data: { progress: parseInt(progress) || 0 }
    });

    return res.status(200).json({ success: true, data: updated, message: 'Goal progress updated' });
  } catch (err) { next(err); }
};

const upsertSkill = async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.user.userId);
    const { name, level } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: { message: 'Skill name is required' } });
    }

    // Check if skill already exists
    const existing = await prisma.employeeSkill.findFirst({
      where: { employeeId: profile.id, name }
    });

    let skill;
    if (existing) {
      skill = await prisma.employeeSkill.update({
        where: { id: existing.id },
        data: { level: parseInt(level) || 0 }
      });
    } else {
      skill = await prisma.employeeSkill.create({
        data: {
          employeeId: profile.id,
          name,
          level: parseInt(level) || 0
        }
      });
    }

    return res.status(200).json({ success: true, data: skill, message: 'Skill registered successfully' });
  } catch (err) { next(err); }
};

const deleteSkill = async (req, res, next) => {
  try {
    const skillId = req.params.id;
    const skill = await prisma.employeeSkill.findUnique({ where: { id: skillId } });

    if (!skill) {
      return res.status(404).json({ success: false, error: { message: 'Skill not found' } });
    }

    const profile = await getOrCreateProfile(req.user.userId);
    if (skill.employeeId !== profile.id) {
      return res.status(403).json({ success: false, error: { message: 'Not authorized' } });
    }

    await prisma.employeeSkill.delete({ where: { id: skillId } });
    return res.status(200).json({ success: true, message: 'Skill deleted' });
  } catch (err) { next(err); }
};

const submitResignation = async (req, res, next) => {
  try {
    const { reason, lastWorkingDay } = req.body;
    if (!lastWorkingDay) {
      return res.status(400).json({ success: false, error: { message: 'Last working day is required.' } });
    }

    const emp = await prisma.employeeProfile.findUnique({
      where: { userId: req.user.userId }
    });
    if (!emp) return res.status(404).json({ success: false, error: { message: 'Employee profile not found.' } });

    const existingExit = await prisma.exitLifecycle.findFirst({
      where: {
        employeeId: emp.id,
        exitType: 'RESIGNATION',
        status: {
          notIn: ['COMPLETED', 'EMPLOYEE_RELIEVED']
        }
      }
    });
    if (existingExit) {
      return res.status(409).json({ success: false, error: { message: 'You have already submitted a resignation request.' } });
    }

    const { handleTransition, LifecycleEvents } = require('../services/workflowService');
    await handleTransition(LifecycleEvents.RESIGNED, {
      employeeId: emp.id,
      reason,
      lastWorkingDay
    });

    return res.status(201).json({ success: true, message: 'Resignation request submitted successfully.' });
  } catch (err) { next(err); }
};

const getResignation = async (req, res, next) => {
  try {
    const emp = await prisma.employeeProfile.findUnique({
      where: { userId: req.user.userId }
    });
    if (!emp) return res.status(404).json({ success: false, error: { message: 'Employee profile not found.' } });

    const resignation = await prisma.exitLifecycle.findFirst({
      where: {
        employeeId: emp.id,
        exitType: 'RESIGNATION'
      },
      orderBy: { submissionDate: 'desc' }
    });

    if (!resignation) {
      return res.status(404).json({ success: false, message: 'No resignation found.' });
    }

    return res.status(200).json({ success: true, data: resignation });
  } catch (err) { next(err); }
};

module.exports = {
  getProfile, updateProfile,
  clockIn, clockOut, getAttendance,
  getLeaves, applyLeave, cancelLeave,
  getPayslips, getPerformance, updateGoalProgress, upsertSkill, deleteSkill,
  getTickets, createTicket, replyTicket, deleteTicketMessage,
  getBenefits, submitBenefitClaim, getTasks,
  getHolidays, getAnnouncements,
  getDocuments, uploadDocument, deleteDocument,
  submitResignation, getResignation, enrollBenefitPlan
};
