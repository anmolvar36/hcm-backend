const prisma = require('../config/prisma');
const { createNotification } = require('../utils/notificationHelper');
const { sendEmail } = require('../utils/emailService');

const LifecycleEvents = {
  APPLIED: 'APPLIED',
  SHORTLISTED: 'SHORTLISTED',
  INTERVIEW: 'INTERVIEW',
  OFFERED: 'OFFERED',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  ONBOARDING: 'ONBOARDING',
  DOCS_SUBMITTED: 'DOCS_SUBMITTED',
  PROMOTED: 'PROMOTED',
  ACTIVE: 'ACTIVE',
  PROBATION: 'PROBATION',
  CONFIRMED: 'CONFIRMED',
  ON_NOTICE: 'ON_NOTICE',
  RESIGNED: 'RESIGNED',
  EXIT_CLEARANCE: 'EXIT_CLEARANCE',
  CLEARANCE_DONE: 'CLEARANCE_DONE',
  TERMINATED: 'TERMINATED'
};

/**
 * Reusable event service to handle transitions between employee lifecycle stages.
 * Evaluates state updates and runs side effects (Notifications, Emails, Audits).
 */
const handleTransition = async (event, data, tx = prisma) => {
  console.log(`[Workflow Engine] Lifecycle Event Triggered: ${event}`, data);

  // Centralized audit logging helper
  const logAudit = async (userId, action, details) => {
    try {
      await tx.auditLog.create({
        data: {
          userId,
          action,
          details,
          ipAddress: 'System Workflow'
        }
      });
    } catch (err) {
      console.error('Centralized audit logging failed:', err);
    }
  };

  switch (event) {
    case LifecycleEvents.OFFERED: {
      const { applicationId } = data;
      // 1. Update job application statuses
      const application = await tx.jobApplication.update({
        where: { id: applicationId },
        data: {
          status: 'OFFERED',
          lifecycleStatus: 'OFFERED'
        },
        include: { candidate: { include: { user: true } }, jobPost: true }
      });

      const candidateUser = application.candidate.user;

      // 2. Dispatch Notifications
      await createNotification({
        userId: candidateUser.id,
        title: 'Job Offer Extended',
        message: `Congratulations! A formal offer has been extended for the role of ${application.jobPost.title}. Please review it in the Candidate Portal.`,
        type: 'SUCCESS',
        link: '/candidate/applications'
      });

      await logAudit(candidateUser.id, 'OFFER_SENT', `Job offer extended to candidate for application: ${applicationId}`);
      break;
    }

    case LifecycleEvents.OFFER_ACCEPTED: {
      const { applicationId } = data;
      // 1. Update application statuses
      const application = await tx.jobApplication.update({
        where: { id: applicationId },
        data: {
          status: 'HIRED',
          lifecycleStatus: 'OFFER_ACCEPTED'
        },
        include: {
          candidate: { include: { user: true } },
          jobPost: true
        }
      });

      const candidateProfile = application.candidate;
      const candidateUser = candidateProfile.user;

      const offer = await tx.offer.findUnique({ where: { applicationId } });

      // 2. Initialize Onboarding record automatically
      const onboarding = await tx.onboarding.upsert({
        where: { applicationId },
        create: {
          applicationId,
          name: candidateProfile.fullName || candidateProfile.user.email.split('@')[0],
          email: candidateProfile.user.email,
          phone: candidateProfile.phone || '',
          role: application.jobPost.title,
          department: application.jobPost.department || 'General',
          joiningDate: offer?.joiningDate || null,
          progress: 20, // Initial stage: Offer Accepted
          status: 'In Progress'
        },
        update: {
          progress: 20,
          status: 'In Progress'
        }
      });

      // 3. Dispatch Notifications
      // HR Notification
      const hrUsers = await tx.user.findMany({ where: { role: { in: ['HR', 'ADMIN'] } } });
      for (const hr of hrUsers) {
        await createNotification({
          userId: hr.id,
          title: 'Offer Accepted',
          message: `${candidateProfile.fullName || candidateProfile.user.email} accepted their offer. Ready for onboarding.`,
          type: 'SUCCESS',
          link: '/hr/onboarding'
        });
      }

      // Candidate Notification
      await createNotification({
        userId: candidateUser.id,
        title: 'Welcome Aboard!',
        message: `You accepted the job offer! Your portal has been upgraded to an Employee dashboard.`,
        type: 'SUCCESS',
        link: '/employee/dashboard'
      });

      await logAudit(candidateUser.id, 'OFFER_ACCEPTED', `Candidate accepted offer for application: ${applicationId}`);
      break;
    }

    case LifecycleEvents.DOCS_SUBMITTED: {
      const { applicationId } = data;
      // 1. Update onboarding task progress to 40% (Documents Submitted)
      const onboarding = await tx.onboarding.findUnique({
        where: { applicationId }
      });
      if (onboarding && onboarding.progress < 40) {
        await tx.onboarding.update({
          where: { applicationId },
          data: {
            progress: 40,
            status: 'In Progress'
          }
        });
      }

      // 2. Notify HR for verification
      const hrUsers = await tx.user.findMany({ where: { role: { in: ['HR', 'ADMIN'] } } });
      for (const hr of hrUsers) {
        await createNotification({
          userId: hr.id,
          title: 'Verification Documents Received',
          message: `Onboarding candidate ${onboarding?.name || 'New Hire'} has uploaded credentials for HR verification.`,
          type: 'INFO',
          link: '/hr/onboarding'
        });
      }
      break;
    }

    case LifecycleEvents.PROMOTED: {
      const { onboardingId, employeeId, departmentId, managerId, joiningDate } = data;
      const onboarding = await tx.onboarding.findUnique({
        where: { id: onboardingId },
        include: { application: { include: { candidate: { include: { user: true } } } } }
      });

      if (!onboarding) throw new Error('Onboarding record not found.');

      const candidateUser = onboarding.application?.candidate?.user || await tx.user.findFirst({ where: { email: onboarding.email } });
      if (!candidateUser) throw new Error('Candidate user account not found.');

      // 1. Promote candidate User role to EMPLOYEE (in case it wasn't already)
      let orgId = candidateUser.organizationId;
      if (!orgId) {
        const sampleUser = await tx.user.findFirst({
          where: { organizationId: { not: null } },
          select: { organizationId: true }
        });
        orgId = sampleUser?.organizationId;
      }
      if (!orgId) {
        const defaultOrg = await tx.organization.findFirst({ select: { id: true } });
        orgId = defaultOrg?.id;
      }

      await tx.user.update({
        where: { id: candidateUser.id },
        data: {
          role: 'EMPLOYEE',
          status: 'Active',
          organizationId: orgId
        }
      });

      // 2. Create or Update EmployeeProfile
      const candidateProfile = onboarding.application?.candidate;
      const existingEmp = await tx.employeeProfile.findUnique({ where: { userId: candidateUser.id } });

      const empData = {
        employeeId: employeeId,
        fullName: onboarding.name,
        phone: onboarding.phone || candidateProfile?.phone || null,
        joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
        avatarUrl: onboarding.avatar || candidateProfile?.avatarUrl || null,
        departmentId: departmentId || null,
        managerId: managerId || null,
        employmentType: 'Full-time',
        lifecycleStatus: 'ACTIVE',
        probationStatus: 'UNDER_PROBATION',
        probationStart: new Date(),
        probationEnd: new Date(new Date().setMonth(new Date().getMonth() + 6)),
        probationReviewDate: new Date(new Date().setMonth(new Date().getMonth() + 5))
      };

      let empProfile;
      if (existingEmp) {
        empProfile = await tx.employeeProfile.update({
          where: { id: existingEmp.id },
          data: empData
        });
      } else {
        empProfile = await tx.employeeProfile.create({
          data: { ...empData, userId: candidateUser.id }
        });
      }

      // 2.5 Create CompensationProfile based on Offer
      if (onboarding.applicationId) {
        const offer = await tx.offer.findFirst({
          where: { applicationId: onboarding.applicationId, status: 'Accepted' },
          orderBy: { createdAt: 'desc' }
        });

        if (offer && offer.salary) {
          let isAnnual = /annual|year|pa|p\.a|y/i.test(offer.salary);
          let isMonthly = /month|pm|p\.m|mo/i.test(offer.salary);
          
          const match = offer.salary.replace(/,/g, '').match(/[\d.]+/);
          let amount = match ? parseFloat(match[0]) : 0;
          
          if (/k/i.test(offer.salary) && amount < 1000) amount *= 1000;
          if (/lakh|lpa|l/i.test(offer.salary) && amount < 1000) amount *= 100000;

          if (!isAnnual && !isMonthly) {
             if (amount > 20000) isAnnual = true;
             else isMonthly = true;
          }

          let monthlyCTC = isAnnual ? amount / 12 : amount;
          let annualCTC = isAnnual ? amount : amount * 12;

          await tx.compensationProfile.upsert({
            where: { employeeId: empProfile.id },
            update: {
              monthlyCTC,
              annualCTC,
              baseSalary: monthlyCTC
            },
            create: {
              employeeId: empProfile.id,
              monthlyCTC,
              annualCTC,
              baseSalary: monthlyCTC,
              effectiveDate: new Date()
            }
          });
        }
      }

      // 3. Migrate skills to EmployeeSkill table
      if (candidateProfile?.skills) {
        const skillsArray = candidateProfile.skills.split(',').map(s => s.trim()).filter(Boolean);
        for (const skill of skillsArray) {
          const existingSkill = await tx.employeeSkill.findFirst({
            where: { employeeId: empProfile.id, name: skill }
          });
          if (!existingSkill) {
            await tx.employeeSkill.create({
              data: {
                employeeId: empProfile.id,
                name: skill,
                level: 70
              }
            });
          }
        }
      }

      // 4. Update onboarding progress to 100% (Completed)
      await tx.onboarding.update({
        where: { id: onboardingId },
        data: {
          progress: 100,
          status: 'Completed'
        }
      });

      // 5. Update Application lifecycle status
      if (onboarding.applicationId) {
        await tx.jobApplication.update({
          where: { id: onboarding.applicationId },
          data: {
            lifecycleStatus: 'ACTIVE'
          }
        });
      }

      // 6. Welcome notifications and emails
      // Only send welcome notification when the employee profile was newly created (first promotion)
      if (!existingEmp) {
        await createNotification({
          userId: candidateUser.id,
          title: 'Credentials Activated',
          message: `Welcome to the company! Your candidate portal has been updated to employee status. You can now clock in and log your details.`,
          type: 'SUCCESS',
          link: '/employee/dashboard'
        });
      }

      await logAudit(candidateUser.id, 'EMPLOYEE_PROMOTED', `Candidate successfully promoted. Employee ID: ${employeeId}`);

      try {
        await sendEmail({
          to: onboarding.email,
          subject: `Welcome to the team, ${onboarding.name}!`,
          text: `Hi ${onboarding.name},\n\nWe are absolutely excited to welcome you to our team! Your account profile has been activated with Employee ID: ${employeeId}.\n\nBest regards,\nHR Team`
        });
      } catch (emailErr) {
        console.error('Welcome email dispatch failed:', emailErr);
      }
      break;
    }

    case LifecycleEvents.RESIGNED: {
      const { employeeId, reason, lastWorkingDay } = data;
      const emp = await tx.employeeProfile.findUnique({
        where: { id: employeeId },
        include: { user: true }
      });
      if (!emp) throw new Error('Employee profile not found.');

      // 1. Create Exit record
      const initialStatus = emp.managerId ? 'PENDING_MANAGER_APPROVAL' : 'PENDING_HR_APPROVAL';
      await tx.exitLifecycle.create({
        data: {
          employeeId,
          exitType: 'RESIGNATION',
          status: initialStatus,
          lastWorkingDay: new Date(lastWorkingDay),
          reason
        }
      });

      // 2. Set employee profile status
      await tx.employeeProfile.update({
        where: { id: employeeId },
        data: {
          lifecycleStatus: 'ON_NOTICE'
        }
      });

      // 3. Notify
      if (emp.managerId) {
        // Notify Manager
        const managerUser = await tx.user.findFirst({
          where: { employeeProfile: { id: emp.managerId } }
        });
        if (managerUser) {
          await createNotification({
            userId: managerUser.id,
            title: 'Resignation Request Submitted',
            message: `${emp.fullName} has submitted resignation. Requires your approval.`,
            type: 'WARNING',
            link: '/manager/resignations'
          });
        }
      } else {
        // Notify HR directly
        const hrUsers = await tx.user.findMany({ where: { role: { in: ['HR', 'ADMIN'] } } });
        for (const hr of hrUsers) {
          await createNotification({
            userId: hr.id,
            title: 'Resignation Request Submitted',
            message: `${emp.fullName} has submitted resignation. Last Working Day: ${lastWorkingDay}.`,
            type: 'WARNING',
            link: '/hr/offboarding'
          });
        }
      }

      await logAudit(emp.userId, 'RESIGNATION_SUBMITTED', `Employee initiated resignation. LWD: ${lastWorkingDay}`);
      break;
    }

    case LifecycleEvents.CLEARANCE_DONE: {
      const { exitId } = data;
      const exit = await tx.exitLifecycle.findUnique({
        where: { id: exitId },
        include: { employee: { include: { user: true } } }
      });
      if (!exit) throw new Error('Exit record not found.');

      // 1. Complete exit status
      await tx.exitLifecycle.update({
        where: { id: exitId },
        data: {
          status: exit.exitType === 'RESIGNATION' ? 'EMPLOYEE_RELIEVED' : 'COMPLETED'
        }
      });

      // 2. Lock User account
      await tx.user.update({
        where: { id: exit.employee.userId },
        data: {
          isActive: false,
          status: 'Inactive'
        }
      });

      // 3. Update Employee Profile status
      await tx.employeeProfile.update({
        where: { id: exit.employeeId },
        data: {
          lifecycleStatus: 'TERMINATED'
        }
      });

      await logAudit(exit.employee.userId, 'EMPLOYEE_TERMINATED', `Final exit clearance signed off. Account deactivated.`);
      break;
    }

    case LifecycleEvents.CONFIRMED: {
      const { employeeId } = data;
      const emp = await tx.employeeProfile.update({
        where: { id: employeeId },
        data: {
          probationStatus: 'CONFIRMED',
          lifecycleStatus: 'CONFIRMED',
          confirmationDate: new Date()
        },
        include: { user: true }
      });

      // Only send probation confirmed notification if the employee was previously under probation
      const priorEmp = await tx.employeeProfile.findUnique({ where: { id: employeeId } });
      if (priorEmp && priorEmp.probationStatus === 'UNDER_PROBATION') {
        await createNotification({
          userId: emp.userId,
          title: 'Probation Confirmed!',
          message: `Congratulations! Your probation period has ended successfully and your employment is confirmed.`,
          type: 'SUCCESS',
          link: '/employee/profile'
        });
      }

      await logAudit(emp.userId, 'PROBATION_CONFIRMED', `Employee probation confirmed.`);
      break;
    }

    default:
      console.warn(`[Workflow Engine] Unrecognized Lifecycle Event ignored: ${event}`);
  }
};

module.exports = {
  LifecycleEvents,
  handleTransition
};
