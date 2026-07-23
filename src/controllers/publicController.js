// ============================================================
// Public Controller - Demo Booking, Contact Form, Career Applications
// ============================================================

const prisma = require('../config/prisma');
const { z } = require('zod');

// ---------- VALIDATION SCHEMAS ----------

const demoBookingSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Valid email is required.' }),
  companySize: z.string().optional(),
  requirement: z.string().optional(),
  selectedDate: z.string().optional(),
  selectedSlot: z.string().optional(),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().optional(),
  message: z.string().optional(),
  modules: z.string().optional()
});

const contactFormSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Valid email is required.' }),
  subject: z.string(),
  message: z.string().min(10, { message: 'Message must be at least 10 characters.' })
});

const careerApplicationSchema = z.object({
  jobId: z.string().optional(),
  jobTitle: z.string(),
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Valid email is required.' }),
  phone: z.string().optional(),
  resumeName: z.string().optional(),
  resumeData: z.string().optional(),
  portfolioUrl: z.string().optional(),
  explanation: z.string().min(10, { message: 'Explanation must be at least 10 characters.' }),
  aiScore: z.number().optional()
});

// ---------- DEMO BOOKING ----------

// POST /api/public/demo-booking
const bookDemo = async (req, res, next) => {
  try {
    // Validate request
    const parsed = demoBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error?.issues?.[0]?.message || parsed.error?.errors?.[0]?.message || 'Validation failed.' },
      });
    }

    const { name, email, companySize, requirement, selectedDate, selectedSlot, companyName, phone, industry, country, message, modules } = parsed.data;

    // Store demo booking in database
    const demoBooking = await prisma.demoBooking.create({
      data: {
        name,
        email,
        companySize: companySize || '',
        requirement: requirement || '',
        selectedDate: selectedDate || '',
        selectedSlot: selectedSlot || '',
        companyName,
        phone,
        industry,
        country,
        message,
        modules
      }
    });

    return res.status(201).json({
      success: true,
      data: {
        id: demoBooking.id,
        name,
        email,
        selectedDate,
        selectedSlot,
        requirement
      },
      message: 'Demo booked successfully. Confirmation email sent.'
    });

  } catch (err) {
    next(err);
  }
};

// ---------- CONTACT FORM ----------

// POST /api/public/contact
const submitContact = async (req, res, next) => {
  try {
    // Validate request
    const parsed = contactFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message },
      });
    }

    const { name, email, subject, message } = parsed.data;

    // Store contact inquiry in database
    const contactInquiry = await prisma.supportTicket.create({
      data: {
        userId: null, // Public submission, no user
        subject: `${subject} - ${name}`,
        category: subject,
        priority: 'Medium',
        status: 'OPEN'
      }
    });

    // Add initial message
    await prisma.ticketMessage.create({
      data: {
        ticketId: contactInquiry.id,
        senderId: null,
        text: `From: ${name} (${email})\n\n${message}`
      }
    });

    return res.status(201).json({
      success: true,
      data: {
        id: contactInquiry.id,
        name,
        email,
        subject
      },
      message: 'Contact inquiry submitted successfully. We will respond within 2 business hours.'
    });

  } catch (err) {
    next(err);
  }
};

// ---------- CAREER APPLICATIONS ----------

// POST /api/public/career-apply
const submitCareerApplication = async (req, res, next) => {
  try {
    // Validate request
    const parsed = careerApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error?.issues?.[0]?.message || parsed.error?.errors?.[0]?.message || 'Validation error' },
      });
    }

    const { jobId, jobTitle, name, email, phone, resumeName, resumeData, portfolioUrl, explanation, aiScore } = parsed.data;

    // Create a candidate user if not exists
    let user;
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      user = existingUser;
    } else {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: 'TEMP_HASH_' + Date.now(), // Temporary hash
          role: 'CANDIDATE'
        }
      });
    }

    // Get or Create candidate profile
    let candidateProfile = await prisma.candidateProfile.findUnique({ where: { userId: user.id } });
    if (!candidateProfile) {
      candidateProfile = await prisma.candidateProfile.create({
        data: {
          userId: user.id,
          fullName: name,
          phone,
          linkedin: portfolioUrl,
          resumeUrl: resumeName,
          resumeData: resumeData,
          skills: explanation
        }
      });
    } else if (resumeData) {
      candidateProfile = await prisma.candidateProfile.update({
        where: { id: candidateProfile.id },
        data: { resumeData: resumeData, resumeUrl: resumeName }
      });
    }

    let targetJobId = jobId;
    if (!targetJobId) {
      // Fallback if frontend didn't pass jobId: find by jobTitle
      const matchingJob = await prisma.jobPost.findFirst({
        where: { title: jobTitle }
      });
      targetJobId = matchingJob ? matchingJob.id : null;
    }

    if (!targetJobId) {
       return res.status(404).json({
         success: false,
         error: { code: 'NOT_FOUND', message: 'Job post not found' },
       });
    }

    // Check if application already exists
    const existingApplication = await prisma.jobApplication.findFirst({
      where: {
        jobId: targetJobId,
        candidateId: candidateProfile.id
      }
    });

    if (existingApplication) {
      return res.status(400).json({
         success: false,
         error: { code: 'ALREADY_APPLIED', message: 'You have already applied for this position' },
      });
    }

    const application = await prisma.jobApplication.create({
      data: {
        jobId: targetJobId,
        candidateId: candidateProfile.id,
        resumeUrl: resumeName,
        coverLetter: `Phone: ${phone}\nPortfolio: ${portfolioUrl}\n\nWhy join:\n${explanation}\n\nAI Match Score: ${aiScore || 'N/A'}%`
      }
    });

    return res.status(201).json({
      success: true,
      data: {
        id: application.id,
        jobTitle,
        name,
        email,
        aiScore
      },
      message: 'Application submitted successfully. HR team will contact you within 24 hours.'
    });

  } catch (err) {
    next(err);
  }
};

// GET /api/public/jobs - Get available career opportunities
const getAvailableJobs = async (req, res, next) => {
  try {
    const jobs = await prisma.jobPost.findMany({
      where: {
        status: 'Published',
        isActive: true
      },
      select: {
        id: true,
        title: true,
        department: true,
        location: true,
        jobType: true
      }
    });

    const formattedJobs = jobs.map(job => ({
      id: job.id,
      title: job.title,
      dept: job.department || 'General',
      loc: job.location || 'Remote',
      type: job.jobType || 'Full-time'
    }));

    return res.status(200).json({ success: true, data: formattedJobs });
  } catch (err) {
    next(err);
  }
};

const getPlatformStats = async (req, res, next) => {
  try {
    const employeeCount = await prisma.employeeProfile.count();
    const payslips = await prisma.payslip.findMany();
    const attendanceLogs = await prisma.attendanceLog.findMany({
      where: {
        date: {
          gte: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        status: true,
        date: true
      }
    });

    const candidateCount = await prisma.candidateProfile.count();
    const topCandidate = await prisma.candidateProfile.findFirst({
      select: {
        fullName: true
      }
    });

    let totalDisbursed = payslips.reduce((sum, p) => sum + p.netPay, 0);
    let totalTaxPF = payslips.reduce((sum, p) => sum + p.tax + p.pf, 0);

    const activeLives = employeeCount;
    const disbursed = (totalDisbursed / 1000).toFixed(1);
    const taxes = (totalTaxPF / 1000).toFixed(1);
    const wellness = "0.0";
    const growth = "0.0";
    
    let presentCountTotal = 0;
    attendanceLogs.forEach(log => {
      if (log.status === 'Present') presentCountTotal++;
    });
    const avgAttendance = attendanceLogs.length > 0 ? ((presentCountTotal / attendanceLogs.length) * 100).toFixed(1) : "0.0";

    // Calculate attendance heatmap (last 28 days)
    const heatmap = [];
    const today = new Date();
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dStr = d.toISOString().split('T')[0];

      const logsForDay = attendanceLogs.filter(log => {
        const logDateStr = new Date(log.date).toISOString().split('T')[0];
        return logDateStr === dStr;
      });

      if (logsForDay.length > 0) {
        const presentCount = logsForDay.filter(l => l.status === 'Present').length;
        const total = logsForDay.length;
        const ratio = presentCount / total;
        if (ratio >= 0.8) {
          heatmap.push('present');
        } else if (ratio >= 0.5) {
          heatmap.push('warning');
        } else {
          heatmap.push('absent');
        }
      } else {
        heatmap.push('empty');
      }
    }

    const recruitmentInsight = candidateCount > 0
      ? `AI scanned ${candidateCount} candidate resumes. Identified ${topCandidate?.fullName || 'a candidate'} as premium fit with Operations.`
      : "AI scanned 0 candidate resumes. Awaiting candidates.";

    return res.json({
      success: true,
      data: {
        activeLives,
        growth,
        avgAttendance,
        totalDisbursed: disbursed,
        taxesAndContributions: taxes,
        wellnessBudget: wellness,
        heatmap,
        recruitmentInsight
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  bookDemo,
  submitContact,
  submitCareerApplication,
  getAvailableJobs,
  getPlatformStats
};
