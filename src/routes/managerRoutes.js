// ============================================================
// Manager Routes  →  /api/manager/*
// ============================================================
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');

const {
  getTeam, addTeamMember,
  getTeamLeaves, reviewLeave,
  assignTask, getTeamTasks, updateTask,
  getTeamPerformance, addPerformanceGoal,
  getTeamAttendance, addManualAttendance,
  getOrgEmployees, addTeamLeaveRequest,
  getTeamReviews, createTeamReview, updateTeamReview,
  getIncrementRequests, approveIncrementRequest, rejectIncrementRequest,
  getResignations, reviewResignation,
  getManagerReimbursements, reviewManagerReimbursement
} = require('../controllers/managerController');

// Only MANAGER (and ADMIN) can access these routes
router.use(protect, authorize('MANAGER', 'ADMIN', 'SUPERADMIN'));

router.get('/team', getTeam);
router.post('/team', addTeamMember);
router.get('/org-employees', getOrgEmployees);
router.get('/attendance', getTeamAttendance);
router.post('/attendance', addManualAttendance);

router.get('/leaves', getTeamLeaves);
router.post('/leaves', addTeamLeaveRequest);
router.patch('/leaves/:id', reviewLeave);

router.get('/tasks', getTeamTasks);
router.post('/tasks', assignTask);
router.patch('/tasks/:id', updateTask);

router.get('/performance', getTeamPerformance);
router.post('/performance', addPerformanceGoal);

router.get('/reviews', getTeamReviews);
router.post('/reviews', createTeamReview);
router.patch('/reviews/:id', updateTeamReview);

router.get('/increments', getIncrementRequests);
router.patch('/increments/:id/approve', approveIncrementRequest);
router.patch('/increments/:id/reject', rejectIncrementRequest);

router.get('/resignations', getResignations);
router.patch('/resignations/:id', reviewResignation);

router.get('/reimbursements', getManagerReimbursements);
router.patch('/reimbursements/:id/review', reviewManagerReimbursement);

module.exports = router;
