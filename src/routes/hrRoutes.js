// ============================================================
// HR Routes  →  /api/hr/*
// ============================================================
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');

const {
  getJobs, createJob, updateJob, deleteJob,
  getApplications, updateApplicationStatus, createApplication, deleteApplication,
  getInterviews, scheduleInterview, updateInterview, deleteInterviewById, updateInterviewStatus, submitInterviewFeedback,
  getAllEmployees, onboardEmployee, deactivateEmployee,
  getAllLeaves,
  getAllTickets, replyTicket, updateTicketStatus,
  getOffers, createOffer, updateOffer, deleteOffer,
  getOnboardingTasks, createOnboardingTask, updateOnboardingTask, deleteOnboardingTask,
  remindManager, sendWelcomeEmailAll,
  promoteCandidate,
  confirmEmployeeProbation, extendEmployeeProbation,
  initiateTermination, getExitsList, updateClearanceStatus, finalizeExit, reviewResignationHr,
  trackCandidateProfile,
} = require('../controllers/hrController');

const { getHRReports } = require('../controllers/reportsController');

const {
  getCompensationProfile, updateCompensationProfile, runPayroll, getPayrollSnapshots,
  finalizePayrollSnapshot, getHRIncrementRequests, approveHRIncrementRequest, rejectHRIncrementRequest
} = require('../controllers/compensationController');

// Only HR, ADMIN, SUPERADMIN
router.use(protect, authorize('HR', 'ADMIN', 'SUPERADMIN'));

// Jobs
router.get('/jobs', getJobs);
router.post('/jobs', createJob);
router.put('/jobs/:id', updateJob);
router.delete('/jobs/:id', deleteJob);

// Compensation & Payroll
router.get('/compensation/:employeeId', getCompensationProfile);
router.put('/compensation/:employeeId', updateCompensationProfile);
router.post('/payroll/run', runPayroll);
router.get('/payroll/snapshots', getPayrollSnapshots);
router.patch('/payroll/:id/finalize', finalizePayrollSnapshot);

// HR Salary Increments
router.get('/payroll/increments', getHRIncrementRequests);
router.patch('/payroll/increments/:id/approve', approveHRIncrementRequest);
router.patch('/payroll/increments/:id/reject', rejectHRIncrementRequest);

// Applications
router.get('/applications', getApplications);
router.post('/applications', createApplication);
router.patch('/applications/:id/status', updateApplicationStatus);
router.patch('/applications/:id/track', trackCandidateProfile);
router.delete('/applications/:id', deleteApplication);

// Offers
router.get('/offers', getOffers);
router.post('/offers', createOffer);
router.put('/offers/:id', updateOffer);
router.delete('/offers/:id', deleteOffer);

// Interviews
router.get('/interviews', getInterviews);
router.post('/interviews', scheduleInterview);
router.put('/interviews/:id', updateInterview);
router.delete('/interviews/:id', deleteInterviewById);
router.patch('/interviews/:id/status', updateInterviewStatus);
router.patch('/interviews/:id/feedback', submitInterviewFeedback);

// Employees
router.get('/employees', getAllEmployees);
router.post('/employees', onboardEmployee);
router.patch('/employees/:id/deactivate', deactivateEmployee);
router.patch('/employees/:id/confirm-probation', confirmEmployeeProbation);
router.patch('/employees/:id/extend-probation', extendEmployeeProbation);

// Exits / Offboarding
router.post('/terminate', initiateTermination);
router.get('/exits', getExitsList);
router.patch('/exits/:id/clearance', updateClearanceStatus);
router.patch('/exits/:id/finalize', finalizeExit);
router.patch('/resignations/:id/approve', reviewResignationHr);

// Leaves
router.get('/leaves', getAllLeaves);

// Support Tickets
router.get('/tickets', getAllTickets);
router.post('/tickets/:id/reply', replyTicket);
router.patch('/tickets/:id/status', updateTicketStatus);

// Onboarding
router.get('/onboarding', getOnboardingTasks);
router.post('/onboarding', createOnboardingTask);
router.put('/onboarding/:id', updateOnboardingTask);
router.delete('/onboarding/:id', deleteOnboardingTask);
router.post('/onboarding/:id/remind-manager', remindManager);
router.post('/onboarding/send-welcome', sendWelcomeEmailAll);
router.post('/onboarding/:id/promote', promoteCandidate);

// Reports
router.get('/reports', getHRReports);

module.exports = router;

