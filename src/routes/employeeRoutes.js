// ============================================================
// Employee Routes  →  /api/employee/*
// ============================================================
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');

const {
  getProfile, updateProfile,
  clockIn, clockOut, getAttendance,
  getLeaves, applyLeave, cancelLeave,
  getPayslips, getPerformance, updateGoalProgress, upsertSkill, deleteSkill,
  getTickets, createTicket, replyTicket, deleteTicketMessage,
  getBenefits, submitBenefitClaim, enrollBenefitPlan, getTasks,
  getDocuments, uploadDocument, deleteDocument,
  getHolidays, getAnnouncements,
  submitResignation, getResignation
} = require('../controllers/employeeController');

const {
  getCompensationProfile, requestIncrement, getPayrollSnapshots
} = require('../controllers/compensationController');

// All routes need login + EMPLOYEE role (also MANAGER, HR can access their own data)
router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

router.post('/attendance/clock-in', clockIn);
router.post('/attendance/clock-out', clockOut);
router.get('/attendance', getAttendance);

router.post('/resignation', submitResignation);
router.get('/resignation', getResignation);

router.get('/leaves', getLeaves);
router.post('/leaves', applyLeave);
router.delete('/leaves/:id', cancelLeave);

router.get('/payslips', getPayslips);

// Enterprise Compensation & Payroll
router.get('/compensation', (req, res, next) => {
  req.params.employeeId = req.user.employeeProfileId;
  getCompensationProfile(req, res, next);
});
router.post('/compensation/increment', requestIncrement);
router.get('/payroll/snapshots', getPayrollSnapshots);
router.get('/performance', getPerformance);
router.post('/performance/goals/:id/progress', updateGoalProgress);
router.post('/performance/skills', upsertSkill);
router.delete('/performance/skills/:id', deleteSkill);
router.get('/benefits', getBenefits);
router.post('/benefits/claims', submitBenefitClaim);
router.get('/tasks', getTasks);

router.get('/tickets', getTickets);
router.post('/tickets', createTicket);
router.post('/tickets/:id/reply', replyTicket);
router.delete('/tickets/:id/messages/:msgId', deleteTicketMessage);

router.get('/holidays', getHolidays);
router.get('/announcements', getAnnouncements);

router.get('/documents', getDocuments);
router.post('/documents', uploadDocument);
router.delete('/documents/:id', deleteDocument);

module.exports = router;
