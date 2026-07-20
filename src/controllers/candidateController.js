// ============================================================
// Candidate Controller
// ============================================================
// Handles: Browse Jobs, Apply, Track Application, View Interviews

const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');

// GET /api/candidate/jobs  (all active jobs)
const getAvailableJobs = async (req, res, next) => {
  try {
    const jobs = await prisma.jobPost.findMany({
      where: { isActive: true, status: 'Published' },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: jobs });
  } catch (err) { next(err); }
};

// POST /api/candidate/jobs/:jobId/apply
const applyToJob = async (req, res, next) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.userId } });
    if (!profile) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Candidate profile not found.' } });

    // Check: already applied?
    const existing = await prisma.jobApplication.findFirst({
      where: { jobId: req.params.jobId, candidateId: profile.id },
    });

    if (existing) return res.status(409).json({ success: false, error: { code: 'ALREADY_APPLIED', message: 'You have already applied for this job.' } });

    // Update candidate profile with the latest application details
    let resumeUrl = req.body.resumeUrl || profile.resumeUrl || null;

    if (req.body.resumeBase64) {
      try {
        const matches = req.body.resumeBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const fs = require('fs');
          const path = require('path');
          const fileBuffer = Buffer.from(matches[2], 'base64');
          
          const safeName = (req.body.resumeUrl || 'resume.pdf').replace(/[^a-zA-Z0-9.\-_]/g, '_');
          const filename = `${Date.now()}_${safeName}`;
          const uploadPath = path.join(__dirname, '../../public/uploads', filename);
          
          fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
          fs.writeFileSync(uploadPath, fileBuffer);
          
          resumeUrl = `http://localhost:5000/uploads/${filename}`;
        }
      } catch (err) {
        console.error("Failed to save uploaded resume:", err);
      }
    }

    await prisma.candidateProfile.update({
      where: { id: profile.id },
      data: {
        fullName: req.body.fullName || undefined,
        phone: req.body.phone || undefined,
        location: req.body.location || undefined,
        expectedSalary: req.body.expectedSalary || undefined,
        experience: req.body.experience || undefined,
        linkedin: req.body.linkedin || undefined,
        portfolio: req.body.portfolio || undefined,
        skills: req.body.skills ? (Array.isArray(req.body.skills) ? req.body.skills.join(', ') : req.body.skills) : undefined,
        resumeUrl: resumeUrl,
      },
    });

    const application = await prisma.jobApplication.create({
      data: {
        jobId: req.params.jobId,
        candidateId: profile.id,
        coverLetter: req.body.coverLetter || null,
        resumeUrl: resumeUrl,
        status: 'APPLIED',
      },
    });

    // Notify Candidate & HR
    try {
      const { createNotification } = require('../utils/notificationHelper');
      const jobPost = await prisma.jobPost.findUnique({ where: { id: req.params.jobId } });
      
      await createNotification({
        userId: req.user.userId,
        title: 'Application Dispatched',
        message: `Your career payload for ${jobPost?.title || 'the role'} has been successfully submitted.`,
        type: 'SUCCESS',
        link: '/candidate/applications'
      });

      const hrUsers = await prisma.user.findMany({
        where: { role: { in: ['HR', 'ADMIN'] } }
      });
      for (const hr of hrUsers) {
        await createNotification({
          userId: hr.id,
          title: 'New Job Candidate',
          message: `${profile.fullName || req.user.email} applied for ${jobPost?.title || 'the role'}.`,
          type: 'SUCCESS',
          link: '/hr/candidates'
        });
      }
    } catch (notifErr) {
      console.error('Failed to trigger job application notifications:', notifErr);
    }

    return res.status(201).json({ success: true, data: application, message: 'Application submitted successfully.' });
  } catch (err) { next(err); }
};

// GET /api/candidate/applications  (my applications)
const getMyApplications = async (req, res, next) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.userId } });
    if (!profile) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Candidate profile not found.' } });

    const applications = await prisma.jobApplication.findMany({
      where: { candidateId: profile.id },
      include: {
        jobPost: { select: { title: true, location: true, jobType: true, salaryRange: true } },
        interviews: {
          select: {
            id: true,
            dateTime: true,
            meetingLink: true,
            feedback: true,
            rating: true,
            status: true,
            round: true,
            type: true,
            interviewer: {
              select: {
                fullName: true
              }
            }
          }
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: applications });
  } catch (err) { next(err); }
};

// GET /api/candidate/profile
const getCandidateProfile = async (req, res, next) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.userId },
      include: { user: { select: { email: true } } },
    });

    return res.status(200).json({ success: true, data: profile });
  } catch (err) { next(err); }
};

// PUT /api/candidate/profile
const updateCandidateProfile = async (req, res, next) => {
  try {
    const { 
      fullName, location, phone, dob, 
      address, city, country, bio, role, currentSalary, noticePeriod,
      expectedSalary, experience, linkedin, portfolio, skills, resumeData,
      avatarUrl, resumeUrl, identityProofUrl, educationProofUrl,
      avatarBase64, resumeBase64, identityProofBase64, educationProofBase64
    } = req.body;

    const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.userId } });
    if (!profile) return res.status(404).json({ success: false, error: { message: 'Profile not found' } });

    const handleBase64Upload = (base64Str, fallbackUrl, filenamePrefix) => {
      if (base64Str) {
        try {
          const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const fs = require('fs');
            const path = require('path');
            const fileBuffer = Buffer.from(matches[2], 'base64');
            const ext = matches[1].split('/')[1] === 'pdf' ? 'pdf' : matches[1].split('/')[1] === 'msword' ? 'doc' : matches[1].split('/')[1] === 'vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'docx' : matches[1].split('/')[1];
            const safeName = `${filenamePrefix}.${ext}`;
            const filename = `${Date.now()}_${safeName}`;
            const uploadPath = path.join(__dirname, '../../public/uploads', filename);
            fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
            fs.writeFileSync(uploadPath, fileBuffer);
            return `http://localhost:5000/uploads/${filename}`;
          }
        } catch (err) {
          console.error(`Failed to save uploaded ${filenamePrefix}:`, err);
        }
      }
      return fallbackUrl; // return what was passed (could be null for deletion or existing url)
    };

    const finalAvatarUrl = handleBase64Upload(avatarBase64, avatarUrl !== undefined ? avatarUrl : profile.avatarUrl, 'avatar');
    const finalResumeUrl = handleBase64Upload(resumeBase64, resumeUrl !== undefined ? resumeUrl : profile.resumeUrl, 'resume');
    const finalIdentityUrl = handleBase64Upload(identityProofBase64, identityProofUrl !== undefined ? identityProofUrl : profile.identityProofUrl, 'identity');
    const finalEducationUrl = handleBase64Upload(educationProofBase64, educationProofUrl !== undefined ? educationProofUrl : profile.educationProofUrl, 'education');

    const updated = await prisma.candidateProfile.update({
      where: { userId: req.user.userId },
      data: {
        fullName: fullName !== undefined ? fullName : undefined,
        location: location !== undefined ? location : undefined,
        phone: phone !== undefined ? phone : undefined,
        dob: dob ? new Date(dob) : undefined,
        address: address !== undefined ? address : undefined,
        city: city !== undefined ? city : undefined,
        country: country !== undefined ? country : undefined,
        bio: bio !== undefined ? bio : undefined,
        role: role !== undefined ? role : undefined,
        currentSalary: currentSalary !== undefined ? currentSalary : undefined,
        noticePeriod: noticePeriod !== undefined ? noticePeriod : undefined,
        avatarUrl: finalAvatarUrl,
        resumeUrl: finalResumeUrl,
        identityProofUrl: finalIdentityUrl,
        educationProofUrl: finalEducationUrl,
        expectedSalary: expectedSalary !== undefined ? expectedSalary : undefined,
        experience: experience !== undefined ? experience : undefined,
        linkedin: linkedin !== undefined ? linkedin : undefined,
        portfolio: portfolio !== undefined ? portfolio : undefined,
        skills: skills !== undefined ? (Array.isArray(skills) ? skills.join(', ') : skills) : undefined,
        resumeData: resumeData !== undefined ? (typeof resumeData === 'object' ? JSON.stringify(resumeData) : resumeData) : undefined,
      },
    });

    if (updated.identityProofUrl && updated.educationProofUrl) {
      const activeApp = await prisma.jobApplication.findFirst({
        where: {
          candidateId: updated.id,
          status: { in: ['HIRED', 'OFFER_ACCEPTED'] }
        }
      });
      if (activeApp) {
        const { handleTransition, LifecycleEvents } = require('../services/workflowService');
        await handleTransition(LifecycleEvents.DOCS_SUBMITTED, {
          applicationId: activeApp.id,
          candidateUserId: req.user.userId
        });
      }
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// PUT /api/candidate/settings
const updateSettings = async (req, res, next) => {
  try {
    const { account, security, notifications, preferences } = req.body;

    // 1. Update account info on CandidateProfile
    if (account) {
      await prisma.candidateProfile.update({
        where: { userId: req.user.userId },
        data: {
          fullName: account.name !== undefined ? account.name : undefined,
          phone: account.phone !== undefined ? account.phone : undefined,
          location: account.location !== undefined ? account.location : undefined,
        },
      });
      // Also update email on User if changed
      if (account.email) {
        await prisma.user.update({
          where: { id: req.user.userId },
          data: { email: account.email },
        });
      }
    }

    // 2. Handle password change
    if (security?.newPassword && security?.currentPassword) {
      const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
      const isMatch = await bcrypt.compare(security.currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(400).json({ success: false, error: { message: 'Current password is incorrect.' } });
      }
      const passwordHash = await bcrypt.hash(security.newPassword, 10);
      await prisma.user.update({ where: { id: req.user.userId }, data: { passwordHash } });
    }

    return res.status(200).json({ success: true, message: 'Settings updated successfully.' });
  } catch (err) { next(err); }
};

// GET /api/candidate/settings
const getSettings = async (req, res, next) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.userId },
      include: { user: { select: { email: true } } },
    });
    if (!profile) return res.status(404).json({ success: false, error: { message: 'Profile not found.' } });

    return res.status(200).json({
      success: true,
      data: {
        account: {
          name: profile.fullName || '',
          email: profile.user?.email || '',
          phone: profile.phone || '',
          location: profile.location || '',
        },
      },
    });
  } catch (err) { next(err); }
};

// DELETE /api/candidate/applications/:appId
const withdrawApplication = async (req, res, next) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user.userId } });
    if (!profile) return res.status(404).json({ success: false, error: { message: 'Candidate profile not found.' } });

    const application = await prisma.jobApplication.findFirst({
      where: { id: req.params.appId, candidateId: profile.id },
    });

    if (!application) {
      return res.status(404).json({ success: false, error: { message: 'Application not found.' } });
    }

    await prisma.jobApplication.delete({
      where: { id: req.params.appId },
    });

    return res.status(200).json({ success: true, message: 'Application withdrawn successfully.' });
  } catch (err) { next(err); }
};

const getMyOffers = async (req, res, next) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.userId }
    });
    if (!profile) return res.status(404).json({ success: false, error: { message: 'Candidate profile not found.' } });

    const offers = await prisma.offer.findMany({
      where: {
        application: {
          candidateId: profile.id
        }
      },
      include: {
        application: {
          include: {
            jobPost: {
              select: {
                title: true,
                location: true,
                salaryRange: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ success: true, data: offers });
  } catch (err) { next(err); }
};

const respondToOffer = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['Accepted', 'Declined'].includes(status)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid status response. Must be Accepted or Declined.' } });
    }

    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.userId }
    });
    if (!profile) return res.status(404).json({ success: false, error: { message: 'Candidate profile not found.' } });

    const offer = await prisma.offer.findFirst({
      where: {
        id: req.params.id,
        application: {
          candidateId: profile.id
        }
      }
    });

    if (!offer) return res.status(404).json({ success: false, error: { message: 'Offer not found.' } });

    const updatedOffer = await prisma.offer.update({
      where: { id: req.params.id },
      data: { status }
    });

    const { handleTransition, LifecycleEvents } = require('../services/workflowService');
    if (status === 'Accepted') {
      await handleTransition(LifecycleEvents.OFFER_ACCEPTED, {
        applicationId: offer.applicationId
      });
    } else {
      await prisma.jobApplication.update({
        where: { id: offer.applicationId },
        data: {
          status: 'REJECTED',
          lifecycleStatus: 'TERMINATED'
        }
      });
    }

    return res.status(200).json({ success: true, data: updatedOffer, message: `Offer ${status.toLowerCase()} successfully.` });
  } catch (err) { next(err); }
};

module.exports = {
  getAvailableJobs,
  applyToJob,
  getMyApplications,
  withdrawApplication,
  getCandidateProfile,
  updateCandidateProfile,
  updateSettings,
  getSettings,
  getMyOffers,
  respondToOffer,
};
