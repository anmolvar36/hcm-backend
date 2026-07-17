// ============================================================
// HR Controller
// ============================================================
// Handles: Job Posts, Applications, Candidates, Interview Pipeline,
//          Onboarding, Employee Management

const prisma = require('../config/prisma');
const { z } = require('zod');
const { sendEmail } = require('../utils/emailService');

// ─────────────────────────────────────────
// JOB POSTS
// ─────────────────────────────────────────

// GET /api/hr/jobs
const getJobs = async (req, res, next) => {
  try {
    const jobs = await prisma.jobPost.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { applications: true } }
      }
    });
    const mapped = jobs.map(j => ({
      ...j,
      applications: undefined,
      applicantCount: j._count.applications,
      _count: undefined
    }));
    return res.status(200).json({ success: true, data: mapped });
  } catch (err) { next(err); }
};

// POST /api/hr/jobs
const createJob = async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(3),
      department: z.string().optional(),
      description: z.string().optional(),
      requirements: z.string().optional(),
      salaryRange: z.string().optional(),
      location: z.string().optional(),
      jobType: z.string().optional(),
      experience: z.string().optional(),
      openings: z.union([z.number(), z.string()]).optional(),
      status: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    if (parsed.data.openings && typeof parsed.data.openings === 'string') {
      parsed.data.openings = parseInt(parsed.data.openings, 10);
    }
    const job = await prisma.jobPost.create({ data: parsed.data });
    return res.status(201).json({ success: true, data: job, message: 'Job posted successfully.' });
  } catch (err) { next(err); }
};

// PUT /api/hr/jobs/:id
const updateJob = async (req, res, next) => {
  try {
    const { title, department, description, requirements, salaryRange, location, jobType, isActive, experience, openings, status } = req.body;

    const parsedOpenings = openings ? parseInt(openings, 10) : undefined;

    const job = await prisma.jobPost.update({
      where: { id: req.params.id },
      data: { title, department, description, requirements, salaryRange, location, jobType, isActive, experience, openings: parsedOpenings, status },
    });

    return res.status(200).json({ success: true, data: job });
  } catch (err) { next(err); }
};

// DELETE /api/hr/jobs/:id
const deleteJob = async (req, res, next) => {
  try {
    await prisma.jobPost.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Job deleted.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// APPLICATIONS & CANDIDATE PIPELINE
// ─────────────────────────────────────────

// GET /api/hr/applications
const getApplications = async (req, res, next) => {
  try {
    const applications = await prisma.jobApplication.findMany({
      include: {
        jobPost: { select: { title: true, requirements: true, experience: true, location: true, jobType: true, salaryRange: true } },
        candidate: {
          include: { user: { select: { email: true } } },
        },
        interviews: true,
      },
      orderBy: { submittedAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: applications });
  } catch (err) { next(err); }
};

// POST /api/hr/applications
const createApplication = async (req, res, next) => {
  try {
    const { name, email, role, exp, match, stage } = req.body;
    
    // First, find or create the candidate User
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash('candidate123', 10);
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: 'CANDIDATE',
          organizationId: req.user?.organizationId || null,
          candidateProfile: {
            create: {
              fullName: name,
              experience: exp,
              skills: `Match:${match}`
            }
          }
        }
      });
    }

    let candProfile = await prisma.candidateProfile.findUnique({ where: { userId: user.id } });
    if (!candProfile) {
       candProfile = await prisma.candidateProfile.create({
          data: {
             userId: user.id,
             fullName: name,
             experience: exp,
          }
       });
    }

    // Next, find a matching JobPost or create a dummy one
    let jobPost = await prisma.jobPost.findFirst({ where: { title: role || 'Open Role' } });
    if (!jobPost) {
      jobPost = await prisma.jobPost.create({
        data: {
          title: role || 'Open Role',
          description: 'Auto-generated job post for manual candidate addition.',
          requirements: '',
          department: 'General'
        }
      });
    }

    let backendStatus = 'APPLIED';
    const stageMap = {
      'Applied': 'APPLIED',
      'Screening': 'SCREENING',
      'Shortlisted': 'SHORTLISTED',
      'Interview': 'INTERVIEWING',
      'Offer': 'OFFERED',
      'Hired': 'HIRED',
      'Rejected': 'REJECTED'
    };
    if (stage && stageMap[stage]) backendStatus = stageMap[stage];

    const app = await prisma.jobApplication.create({
      data: {
        jobId: jobPost.id,
        candidateId: candProfile.id,
        status: backendStatus
      },
      include: {
        jobPost: { select: { title: true, requirements: true, experience: true, location: true, jobType: true, salaryRange: true } },
        candidate: {
          include: { user: { select: { email: true } } },
        },
        interviews: true,
      }
    });

    if (backendStatus === 'HIRED') {
      const { handleTransition, LifecycleEvents } = require('../services/workflowService');
      await handleTransition(LifecycleEvents.OFFER_ACCEPTED, { applicationId: app.id });
    }

    return res.status(201).json({ success: true, data: app, message: 'Candidate added successfully.' });
  } catch (err) { next(err); }
};

// PATCH /api/hr/applications/:id/status
const updateApplicationStatus = async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEWING', 'OFFERED', 'HIRED', 'REJECTED']),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    // Auto-promote logic when marked as HIRED
    if (parsed.data.status === 'HIRED') {
      const { handleTransition, LifecycleEvents } = require('../services/workflowService');
      // Seed onboarding and auto promote
      await handleTransition(LifecycleEvents.OFFER_ACCEPTED, { applicationId: req.params.id });
      
      const updatedApp = await prisma.jobApplication.findUnique({
        where: { id: req.params.id },
        include: {
          candidate: { select: { userId: true, fullName: true, user: { select: { organization: { select: { name: true } } } } } },
          jobPost: { select: { title: true } }
        }
      });

      return res.status(200).json({ success: true, data: updatedApp, message: 'Candidate hired and automatically promoted to Employee.' });
    }

    const app = await prisma.jobApplication.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status },
      include: {
        candidate: { select: { userId: true, fullName: true, user: { select: { organization: { select: { name: true } } } } } },
        jobPost: { select: { title: true } }
      }
    });

    try {
      const { createNotification } = require('../utils/notificationHelper');
      if (app.candidate && app.candidate.userId) {
        let title = 'Application Update';
        let message = `Your application for ${app.jobPost?.title || 'the role'} is now in status ${parsed.data.status.toLowerCase()}.`;
        let type = 'INFO';
        let link = '/candidate/notifications';

        if (parsed.data.status === 'SCREENING' || parsed.data.status === 'SHORTLISTED') {
          title = 'Shortlist Activation';
          message = `You have been advanced to Screening/Shortlist for the ${app.jobPost?.title || 'role'}.`;
          type = 'SUCCESS';
        } else if (parsed.data.status === 'OFFERED') {
          const orgName = app.candidate?.user?.organization?.name || 'The company';
          title = 'Tactical Offer Payload';
          message = `${orgName} has dispatched a formal career offer for the ${app.jobPost?.title || 'role'} role.`;
          type = 'SUCCESS';
        }

        await createNotification({
          userId: app.candidate.userId,
          title,
          message,
          type,
          link
        });
      }
    } catch (notifErr) {
      console.error('Failed to trigger application status notification:', notifErr);
    }

    return res.status(200).json({ success: true, data: app, message: 'Application status updated.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// INTERVIEWS
// ─────────────────────────────────────────

// GET /api/hr/interviews
const trackCandidateProfile = async (req, res, next) => {
  try {
    const { action } = req.body; // 'view' or 'download'
    const app = await prisma.jobApplication.findUnique({ where: { id: req.params.id }, select: { candidateId: true } });
    if (!app || !app.candidateId) return res.status(404).json({ success: false, message: 'Application not found' });
    
    const updateData = action === 'download' 
      ? { resumeDownloads: { increment: 1 } }
      : { profileViews: { increment: 1 } };
      
    await prisma.candidateProfile.update({
      where: { id: app.candidateId },
      data: updateData
    });
    return res.status(200).json({ success: true, message: 'Tracked successfully' });
  } catch (err) {
    next(err);
  }
};

const getInterviews = async (req, res, next) => {
  try {
    const interviews = await prisma.interview.findMany({
      include: {
        application: {
          include: {
            candidate: { include: { user: { select: { email: true } } } },
            jobPost: { select: { title: true } },
          },
        },
        interviewer: { select: { fullName: true, employeeId: true } },
      },
      orderBy: { dateTime: 'asc' },
    });

    return res.status(200).json({ success: true, data: interviews });
  } catch (err) { next(err); }
};

// POST /api/hr/interviews
// Accepts either structured IDs OR friendly fields (candidateName, role, date, time)
const scheduleInterview = async (req, res, next) => {
  try {
    const { applicationId, interviewerId, dateTime, meetingLink, candidate, role, date, time, round, type } = req.body;

    let resolvedAppId = applicationId;
    let resolvedInterviewerId = interviewerId;
    let resolvedDateTime = dateTime ? new Date(dateTime) : null;

    // Build dateTime from separate date + time if not provided as ISO
    if (!resolvedDateTime && date) {
      const timePart = time || '10:00';
      resolvedDateTime = new Date(`${date}T${timePart}:00`);
    }
    if (!resolvedDateTime) {
      resolvedDateTime = new Date();
    }

    // Auto-resolve applicationId from candidate name/email
    if (!resolvedAppId && candidate) {
      const app = await prisma.jobApplication.findFirst({
        where: {
          OR: [
            { candidate: { fullName: { contains: candidate } } },
            { candidate: { user: { email: { contains: candidate } } } },
          ],
        },
        orderBy: { submittedAt: 'desc' },
      });
      if (app) {
        resolvedAppId = app.id;
      } else {
        // Create a minimal application for this candidate
        let user = await prisma.user.findFirst({ where: { email: { contains: candidate } } });
        if (!user) {
          const bcryptLib = require('bcryptjs');
          const hash = await bcryptLib.hash('candidate123', 10);
          user = await prisma.user.create({
            data: {
              email: `${candidate.toLowerCase().replace(/\s+/g, '.')}@candidate.local`,
              passwordHash: hash,
              role: 'CANDIDATE',
              organizationId: req.user?.organizationId || null,
              candidateProfile: { create: { fullName: candidate } },
            },
          });
        }
        let candProfile = await prisma.candidateProfile.findUnique({ where: { userId: user.id } });
        if (!candProfile) {
          candProfile = await prisma.candidateProfile.create({ data: { userId: user.id, fullName: candidate } });
        }
        let jobPost = await prisma.jobPost.findFirst({ where: { title: role || 'Open Role' } });
        if (!jobPost) {
          jobPost = await prisma.jobPost.create({ data: { title: role || 'Open Role', description: 'Auto-created for interview scheduling.', requirements: '' } });
        }
        const newApp = await prisma.jobApplication.create({ data: { jobId: jobPost.id, candidateId: candProfile.id, status: 'INTERVIEWING' } });
        resolvedAppId = newApp.id;
      }
    }

    if (!resolvedAppId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'applicationId or candidate name is required.' } });
    }

    // Auto-resolve interviewerId - pick first employee if not provided
    if (!resolvedInterviewerId) {
      const emp = await prisma.employeeProfile.findFirst({ orderBy: { joiningDate: 'asc' } });
      if (emp) resolvedInterviewerId = emp.id;
      else return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No interviewers available. Create an employee first.' } });
    }

    // Update application status to INTERVIEWING
    await prisma.jobApplication.update({
      where: { id: resolvedAppId },
      data: { status: 'INTERVIEWING' },
    }).catch(() => {}); // ignore if already INTERVIEWING

    const interview = await prisma.interview.create({
      data: {
        applicationId: resolvedAppId,
        interviewerId: resolvedInterviewerId,
        dateTime: resolvedDateTime,
        meetingLink: meetingLink || null,
        status: 'Scheduled',
        round: round || 'Technical Round',
        type: type || 'Video Call',
      },
      include: {
        application: {
          include: {
            candidate: { include: { user: { select: { email: true } } } },
            jobPost: { select: { title: true } },
          },
        },
        interviewer: { select: { fullName: true, employeeId: true } },
      },
    });

    try {
      const { createNotification } = require('../utils/notificationHelper');
      // Notify Candidate
      if (interview.application?.candidate?.userId) {
        const interviewTimeStr = new Date(interview.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await createNotification({
          userId: interview.application.candidate.userId,
          title: 'Interview Confirmation',
          message: `Interview scheduled with ${interview.interviewer?.fullName || 'HR Team'} tomorrow at ${interviewTimeStr}.`,
          type: 'INFO',
          link: '/candidate/interviews'
        });
      }
      
      // Notify Interviewer (Employee)
      const interviewerUser = await prisma.employeeProfile.findUnique({
        where: { id: resolvedInterviewerId },
        select: { userId: true }
      });
      if (interviewerUser && interviewerUser.userId) {
        await createNotification({
          userId: interviewerUser.userId,
          title: 'Interview Assignment',
          message: `You have been assigned to conduct an interview for ${interview.application?.candidate?.fullName || 'a candidate'} on ${new Date(interview.dateTime).toLocaleString()}.`,
          type: 'INFO',
          link: '/employee/dashboard'
        });
      }
    } catch (notifErr) {
      console.error('Failed to trigger interview schedule notifications:', notifErr);
    }

    return res.status(201).json({ success: true, data: interview, message: 'Interview scheduled.' });
  } catch (err) { next(err); }
};

// PUT /api/hr/interviews/:id
const updateInterview = async (req, res, next) => {
  try {
    const { dateTime, date, time, meetingLink, round, type, status, interviewerId, candidate } = req.body;

    const updateData = {};
    if (dateTime) updateData.dateTime = new Date(dateTime);
    else if (date) {
      const timePart = time || '10:00';
      updateData.dateTime = new Date(`${date}T${timePart}:00`);
    }
    if (meetingLink !== undefined) updateData.meetingLink = meetingLink;
    if (round) updateData.round = round;
    if (type) updateData.type = type;
    if (status) updateData.status = status;
    if (interviewerId) updateData.interviewerId = interviewerId;

    const updated = await prisma.interview.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        application: {
          include: {
            candidate: { include: { user: { select: { email: true } } } },
            jobPost: { select: { title: true } },
          },
        },
        interviewer: { select: { fullName: true, employeeId: true } },
      },
    });

    return res.status(200).json({ success: true, data: updated, message: 'Interview updated.' });
  } catch (err) { next(err); }
};

// DELETE /api/hr/interviews/:id
const deleteInterviewById = async (req, res, next) => {
  try {
    await prisma.interview.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Interview deleted.' });
  } catch (err) { next(err); }
};

// PATCH /api/hr/interviews/:id/status
const updateInterviewStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Status is required.' } });

    const updated = await prisma.interview.update({
      where: { id: req.params.id },
      data: { status },
    });

    return res.status(200).json({ success: true, data: updated, message: 'Interview status updated.' });
  } catch (err) { next(err); }
};

// PATCH /api/hr/interviews/:id/feedback
const submitInterviewFeedback = async (req, res, next) => {
  try {
    const { feedback, rating } = req.body;

    const updated = await prisma.interview.update({
      where: { id: req.params.id },
      data: { feedback, rating: rating ? parseInt(rating) : null },
    });

    return res.status(200).json({ success: true, data: updated, message: 'Feedback submitted.' });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────
// EMPLOYEE MANAGEMENT (HR creating employees)
// ─────────────────────────────────────────
const bcrypt = require('bcryptjs');

// GET /api/hr/employees
const getAllEmployees = async (req, res, next) => {
  try {
    const employees = await prisma.employeeProfile.findMany({
      include: {
        department: true,
        user: { select: { email: true, role: true, isActive: true } },
        manager: { select: { fullName: true } },
      },
      orderBy: { joiningDate: 'desc' },
    });

    return res.status(200).json({ success: true, data: employees, meta: { total: employees.length } });
  } catch (err) { next(err); }
};

// POST /api/hr/employees  (onboard new employee)
const onboardEmployee = async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['HR', 'MANAGER', 'EMPLOYEE']),
      fullName: z.string().min(2),
      employeeId: z.string().min(2),
      phone: z.string().optional(),
      departmentId: z.string().optional(),
      managerId: z.string().optional(),
      joiningDate: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } });
    }

    const { email, password, role, fullName, employeeId, phone, departmentId, managerId, joiningDate } = parsed.data;

    // Check duplicate email
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ success: false, error: { code: 'EMAIL_TAKEN', message: 'Email already in use.' } });

    // Check duplicate employeeId
    const existingEmpId = await prisma.employeeProfile.findUnique({ where: { employeeId } });
    if (existingEmpId) return res.status(409).json({ success: false, error: { code: 'EMPID_TAKEN', message: 'Employee ID already in use.' } });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        organizationId: req.user.organizationId || null,
        employeeProfile: {
          create: {
            employeeId,
            fullName,
            phone,
            departmentId: departmentId || null,
            managerId: managerId || null,
            joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
          },
        },
      },
      include: { employeeProfile: true },
    });

    return res.status(201).json({ success: true, data: user, message: 'Employee onboarded successfully.' });
  } catch (err) { next(err); }
};

// PATCH /api/hr/employees/:id/deactivate
const deactivateEmployee = async (req, res, next) => {
  try {
    const profile = await prisma.employeeProfile.findUnique({
      where: { id: req.params.id },
    });
    if (!profile) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found.' } });

    // Update active user status
    await prisma.user.update({
      where: { id: profile.userId },
      data: { isActive: false, status: 'Inactive' },
    });

    // Update employee profile lifecycle status to TERMINATED
    await prisma.employeeProfile.update({
      where: { id: profile.id },
      data: { lifecycleStatus: 'TERMINATED' }
    });

    // Handle ExitLifecycle entry if not already present
    const existingExit = await prisma.exitLifecycle.findFirst({
      where: { employeeId: profile.id }
    });
    if (!existingExit) {
      await prisma.exitLifecycle.create({
        data: {
          employeeId: profile.id,
          exitType: 'TERMINATION',
          status: 'COMPLETED',
          lastWorkingDay: new Date(),
          itClearance: true,
          financeClearance: true,
          hrClearance: true,
          reason: 'Manual deactivation'
        }
      });
    } else if (existingExit.status !== 'COMPLETED') {
      await prisma.exitLifecycle.update({
        where: { id: existingExit.id },
        data: {
          status: 'COMPLETED',
          itClearance: true,
          financeClearance: true,
          hrClearance: true
        }
      });
    }

    // Centralized Audit Log
    await prisma.auditLog.create({
      data: {
        userId: profile.userId,
        action: 'EMPLOYEE_DEACTIVATED',
        details: 'Account manually deactivated and marked as terminated.',
        ipAddress: req.ip || req.socket.remoteAddress
      }
    });

    return res.status(200).json({ success: true, message: 'Employee deactivated and exit completed.' });
  } catch (err) { next(err); }
};

// PATCH /api/hr/employees/:id/confirm-probation
const confirmEmployeeProbation = async (req, res, next) => {
  try {
    const { handleTransition, LifecycleEvents } = require('../services/workflowService');
    await handleTransition(LifecycleEvents.CONFIRMED, {
      employeeId: req.params.id
    });
    return res.status(200).json({ success: true, message: 'Employee probation confirmed successfully.' });
  } catch (err) { next(err); }
};

// PATCH /api/hr/employees/:id/extend-probation
const extendEmployeeProbation = async (req, res, next) => {
  try {
    const { months } = req.body;
    const extensionMonths = parseInt(months) || 3;

    const profile = await prisma.employeeProfile.findUnique({
      where: { id: req.params.id }
    });
    if (!profile) return res.status(404).json({ success: false, error: { message: 'Employee profile not found.' } });

    const currentEnd = profile.probationEnd ? new Date(profile.probationEnd) : new Date();
    const newEnd = new Date(currentEnd.setMonth(currentEnd.getMonth() + extensionMonths));
    const currentReview = profile.probationReviewDate ? new Date(profile.probationReviewDate) : new Date();
    const newReview = new Date(currentReview.setMonth(currentReview.getMonth() + extensionMonths));

    const updated = await prisma.employeeProfile.update({
      where: { id: req.params.id },
      data: {
        probationEnd: newEnd,
        probationReviewDate: newReview,
        probationExtension: (profile.probationExtension || 0) + extensionMonths,
        probationStatus: 'EXTENDED'
      }
    });

    const { createNotification } = require('../utils/notificationHelper');
    await createNotification({
      userId: profile.userId,
      title: 'Probation Extended',
      message: `Your probation period has been extended by ${extensionMonths} months. New end date is ${newEnd.toLocaleDateString()}.`,
      type: 'WARNING',
      link: '/employee/profile'
    });

    return res.status(200).json({ success: true, data: updated, message: `Probation extended by ${extensionMonths} months.` });
  } catch (err) { next(err); }
};

// POST /api/hr/terminate (initiate exit/termination)
const initiateTermination = async (req, res, next) => {
  try {
    const { employeeId, reason, lastWorkingDay } = req.body;
    if (!employeeId || !lastWorkingDay) {
      return res.status(400).json({ success: false, error: { message: 'Employee ID and Last Working Day are required.' } });
    }

    const emp = await prisma.employeeProfile.findUnique({
      where: { id: employeeId },
      include: { user: true }
    });
    if (!emp) return res.status(404).json({ success: false, error: { message: 'Employee profile not found.' } });

    const existingExit = await prisma.exitLifecycle.findFirst({
      where: {
        employeeId,
        status: { in: ['INITIATED', 'CLEARANCE_IN_PROGRESS'] }
      }
    });
    if (existingExit) return res.status(409).json({ success: false, error: { message: 'Active exit lifecycle already exists for this employee.' } });

    const exit = await prisma.exitLifecycle.create({
      data: {
        employeeId,
        exitType: 'TERMINATION',
        status: 'INITIATED',
        lastWorkingDay: new Date(lastWorkingDay),
        reason
      }
    });

    await prisma.employeeProfile.update({
      where: { id: employeeId },
      data: {
        lifecycleStatus: 'ON_NOTICE'
      }
    });

    const { createNotification } = require('../utils/notificationHelper');
    await createNotification({
      userId: emp.userId,
      title: 'Exit Clearance Initiated',
      message: `An exit clearance process has been initialized for your account. Last working day is set to ${lastWorkingDay}.`,
      type: 'ALERT',
      link: '/employee/profile'
    });

    return res.status(201).json({ success: true, data: exit, message: 'Exit lifecycle initiated successfully.' });
  } catch (err) { next(err); }
};

// GET /api/hr/exits
const getExitsList = async (req, res, next) => {
  try {
    const exits = await prisma.exitLifecycle.findMany({
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            fullName: true,
            joiningDate: true,
            department: { select: { name: true } },
            user: { select: { email: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ success: true, data: exits });
  } catch (err) { next(err); }
};

// PATCH /api/hr/resignations/:id
const reviewResignationHr = async (req, res, next) => {
  try {
    const { status, hrComment, finalLastWorkingDay } = req.body;
    const exitId = req.params.id;

    if (!['APPROVED', 'REJECTED_BY_HR'].includes(status)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid status for HR review.' } });
    }

    const hrProfile = await prisma.employeeProfile.findUnique({
      where: { userId: req.user.userId }
    });

    const exit = await prisma.exitLifecycle.findUnique({
      where: { id: exitId },
      include: { employee: true }
    });

    if (!exit) {
      return res.status(404).json({ success: false, error: { message: 'Resignation not found.' } });
    }

    const updated = await prisma.exitLifecycle.update({
      where: { id: exitId },
      data: {
        status,
        hrId: hrProfile ? hrProfile.id : req.user.userId,
        hrComment,
        hrDecisionDate: new Date(),
        ...(finalLastWorkingDay && { finalLastWorkingDay: new Date(finalLastWorkingDay) }),
        ...(status === 'APPROVED' && { lastWorkingDay: finalLastWorkingDay ? new Date(finalLastWorkingDay) : exit.lastWorkingDay }) // sync LWD
      }
    });

    const { createNotification } = require('../utils/notificationHelper');
    if (status === 'APPROVED') {
      await createNotification({
        userId: exit.employee.userId,
        title: 'Resignation Approved',
        message: `HR has approved your resignation. Your final LWD is ${finalLastWorkingDay || exit.lastWorkingDay}.`,
        type: 'INFO',
        link: '/employee/dashboard'
      });
      // Optionally notify IT/Finance here for clearance initiation
    } else if (status === 'REJECTED_BY_HR') {
      await createNotification({
        userId: exit.employee.userId,
        title: 'Resignation Rejected',
        message: `HR has rejected your resignation request.`,
        type: 'WARNING',
        link: '/employee/dashboard'
      });
    }

    return res.status(200).json({ success: true, data: updated, message: 'Resignation HR review completed.' });
  } catch (err) { next(err); }
};


// PATCH /api/hr/exits/:id/clearance
const updateClearanceStatus = async (req, res, next) => {
  try {
    const { itClearance, financeClearance, hrClearance, exitInterviewFeedback, exitInterviewRating } = req.body;
    
    const updateData = {};
    if (itClearance !== undefined) updateData.itClearance = itClearance;
    if (financeClearance !== undefined) updateData.financeClearance = financeClearance;
    if (hrClearance !== undefined) updateData.hrClearance = hrClearance;
    if (exitInterviewFeedback !== undefined) updateData.exitInterviewFeedback = exitInterviewFeedback;
    if (exitInterviewRating !== undefined) updateData.exitInterviewRating = parseInt(exitInterviewRating);

    // If all clearances are set to true, advance status automatically
    const current = await prisma.exitLifecycle.findUnique({
      where: { id: req.params.id }
    });
    if (!current) return res.status(404).json({ success: false, error: { message: 'Exit record not found.' } });

    const finalIT = itClearance !== undefined ? itClearance : current.itClearance;
    const finalFinance = financeClearance !== undefined ? financeClearance : current.financeClearance;
    const finalHR = hrClearance !== undefined ? hrClearance : current.hrClearance;

    if (finalIT && finalFinance && finalHR) {
      updateData.status = 'CLEARANCE_IN_PROGRESS';
    }

    const updated = await prisma.exitLifecycle.update({
      where: { id: req.params.id },
      data: updateData,
      include: { employee: true }
    });

    return res.status(200).json({ success: true, data: updated, message: 'Clearance checklist updated.' });
  } catch (err) { next(err); }
};

// PATCH /api/hr/exits/:id/finalize
const finalizeExit = async (req, res, next) => {
  try {
    const { handleTransition, LifecycleEvents } = require('../services/workflowService');
    await handleTransition(LifecycleEvents.CLEARANCE_DONE, {
      exitId: req.params.id
    });
    return res.status(200).json({ success: true, message: 'Employee exit finalized and account deactivated.' });
  } catch (err) { next(err); }
};

// GET /api/hr/leaves  (all pending leaves)
const getAllLeaves = async (req, res, next) => {
  try {
    const leaves = await prisma.leaveRequest.findMany({
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

// GET /api/hr/tickets  (all support tickets)
const getAllTickets = async (req, res, next) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      include: {
        user: { select: { email: true, employeeProfile: { select: { fullName: true } } } },
        messages: { include: { sender: { select: { email: true, role: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: tickets });
  } catch (err) { next(err); }
};

// POST /api/hr/tickets/:id/reply
const replyTicket = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Reply text is required.' } });

    const msg = await prisma.ticketMessage.create({
      data: { ticketId: req.params.id, senderId: req.user.userId, text },
    });

    return res.status(201).json({ success: true, data: msg });
  } catch (err) { next(err); }
};

// PATCH /api/hr/tickets/:id/status
const updateTicketStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const updated = await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { status },
    });

    try {
      const { createNotification } = require('../utils/notificationHelper');
      await createNotification({
        userId: updated.userId,
        title: 'Support Ticket Update',
        message: `Your support ticket "${updated.subject}" status has been updated to ${status}.`,
        type: 'INFO',
        link: '/employee/help'
      });
    } catch (notifErr) {
      console.error('Failed to trigger support ticket status notification:', notifErr);
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// GET /api/hr/offers
const getOffers = async (req, res, next) => {
  try {
    const offers = await prisma.offer.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ success: true, data: offers });
  } catch (err) { next(err); }
};

// POST /api/hr/offers
const createOffer = async (req, res, next) => {
  try {
    const { candidate, role, salary, joiningDate, status, sentDate, applicationId } = req.body;
    const offer = await prisma.offer.create({
      data: {
        applicationId: applicationId || null,
        candidate,
        role,
        salary: salary || '',
        joiningDate: joiningDate || '',
        status: status || 'Sent',
        sentDate: sentDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }
    });

    if (applicationId) {
      const { handleTransition, LifecycleEvents } = require('../services/workflowService');
      await handleTransition(LifecycleEvents.OFFERED, { applicationId });
    }

    return res.status(201).json({ success: true, data: offer });
  } catch (err) { next(err); }
};

// PUT /api/hr/offers/:id
const updateOffer = async (req, res, next) => {
  try {
    const { candidate, role, salary, joiningDate, status, sentDate } = req.body;
    const offer = await prisma.offer.update({
      where: { id: req.params.id },
      data: {
        candidate,
        role,
        salary,
        joiningDate,
        status,
        sentDate
      }
    });
    return res.status(200).json({ success: true, data: offer });
  } catch (err) { next(err); }
};

// DELETE /api/hr/offers/:id
const deleteOffer = async (req, res, next) => {
  try {
    await prisma.offer.delete({
      where: { id: req.params.id }
    });
    return res.status(200).json({ success: true, message: 'Offer deleted successfully.' });
  } catch (err) { next(err); }
};

// DELETE /api/hr/applications/:id
const deleteApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.jobApplication.delete({
      where: { id }
    });
    return res.status(200).json({ success: true, message: 'Application deleted successfully.' });
  } catch (err) { next(err); }
};

// ============================================================
// ONBOARDING
// ============================================================

// GET /api/hr/onboarding
const getOnboardingTasks = async (req, res, next) => {
  try {
    const tasks = await prisma.onboarding.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ success: true, data: tasks });
  } catch (err) { next(err); }
};

// POST /api/hr/onboarding
const createOnboardingTask = async (req, res, next) => {
  try {
    const { name, email, phone, role, department, manager, joiningDate, progress, status, avatar } = req.body;
    const task = await prisma.onboarding.create({
      data: {
        name,
        email,
        phone,
        role,
        department,
        manager,
        joiningDate,
        progress: progress || 0,
        status: status || 'Not Started',
        avatar
      }
    });
    return res.status(201).json({ success: true, data: task });
  } catch (err) { next(err); }
};

// PUT /api/hr/onboarding/:id
const updateOnboardingTask = async (req, res, next) => {
  try {
    const { progress, status, name, email, phone, role, department, manager, joiningDate, avatar } = req.body;
    const updateData = {};
    if (progress !== undefined) updateData.progress = progress;
    if (status !== undefined) updateData.status = status;
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;
    if (department !== undefined) updateData.department = department;
    if (manager !== undefined) updateData.manager = manager;
    if (joiningDate !== undefined) updateData.joiningDate = joiningDate;
    if (avatar !== undefined) updateData.avatar = avatar;

    const task = await prisma.onboarding.update({
      where: { id: req.params.id },
      data: updateData
    });
    return res.status(200).json({ success: true, data: task });
  } catch (err) { next(err); }
};

// DELETE /api/hr/onboarding/:id
const deleteOnboardingTask = async (req, res, next) => {
  try {
    await prisma.onboarding.delete({
      where: { id: req.params.id }
    });
    return res.status(200).json({ success: true, message: 'Onboarding task deleted successfully.' });
  } catch (err) { next(err); }
};

// POST /api/hr/onboarding/:id/remind-manager
const remindManager = async (req, res, next) => {
  try {
    const task = await prisma.onboarding.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    
    await sendEmail({
      to: 'manager@hcmportal.local',
      subject: `Onboarding Reminder: ${task.name}`,
      text: `Hello ${task.manager || 'Manager'},\n\nPlease remember to complete the onboarding steps for ${task.name} joining as ${task.role}.\n\nThanks,\nHR Team`
    });
    
    return res.status(200).json({ success: true, message: 'Manager reminded' });
  } catch (err) { next(err); }
};

// POST /api/hr/onboarding/send-welcome
const sendWelcomeEmailAll = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ success: false, message: 'No candidate IDs provided' });
    
    const tasks = await prisma.onboarding.findMany({ where: { id: { in: ids } } });
    
    for (const task of tasks) {
      if (task.email) {
        await sendEmail({
          to: task.email,
          subject: `Welcome to the team, ${task.name}!`,
          text: `Hi ${task.name},\n\nWe are excited to welcome you to the team as our new ${task.role}. Your onboarding process has started.\n\nBest,\nHR Team`
        });
      }
    }
    
    return res.status(200).json({ success: true, message: 'Welcome emails sent' });
  } catch (err) { next(err); }
};

// POST /api/hr/onboarding/:id/promote
const promoteCandidate = async (req, res, next) => {
  try {
    const { employeeId, departmentId, managerId, joiningDate } = req.body;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: { message: 'Employee ID is required.' } });
    }

    const existingEmpId = await prisma.employeeProfile.findUnique({ where: { employeeId } });
    if (existingEmpId) {
      return res.status(409).json({ success: false, error: { message: 'Employee ID is already in use.' } });
    }

    const { handleTransition, LifecycleEvents } = require('../services/workflowService');
    await handleTransition(LifecycleEvents.PROMOTED, {
      onboardingId: req.params.id,
      employeeId,
      departmentId,
      managerId,
      joiningDate
    });

    return res.status(200).json({ success: true, message: 'Candidate promoted to Employee successfully.' });
  } catch (err) { next(err); }
};

module.exports = {
  getJobs, createJob, updateJob, deleteJob,
  getApplications, createApplication, updateApplicationStatus, deleteApplication,
  trackCandidateProfile,
  getInterviews, scheduleInterview, updateInterview, deleteInterviewById, updateInterviewStatus, submitInterviewFeedback,
  getAllEmployees, onboardEmployee, deactivateEmployee,
  getAllLeaves,
  getAllTickets, replyTicket, updateTicketStatus,
  getOffers, createOffer, updateOffer, deleteOffer,
  getOnboardingTasks, createOnboardingTask, updateOnboardingTask, deleteOnboardingTask,
  remindManager, sendWelcomeEmailAll,
  promoteCandidate,
  confirmEmployeeProbation, extendEmployeeProbation,
  initiateTermination, getExitsList, updateClearanceStatus, finalizeExit,
  reviewResignationHr
};
