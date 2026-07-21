// ============================================================
// Calendar Routes
// ============================================================
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');

const {
  getAllCalendars,
  getCalendarById,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  assignCalendar,
  removeAssignment
} = require('../controllers/calendarController');

router.route('/')
  .get(protect, getAllCalendars)
  .post(protect, authorize('ADMIN', 'SUPERADMIN', 'HR'), createCalendar);

router.route('/:id')
  .get(protect, getCalendarById)
  .put(protect, authorize('ADMIN', 'SUPERADMIN', 'HR'), updateCalendar)
  .delete(protect, authorize('ADMIN', 'SUPERADMIN', 'HR'), deleteCalendar);

router.post('/assign', protect, authorize('ADMIN', 'SUPERADMIN', 'HR'), assignCalendar);
router.delete('/assignments/:id', protect, authorize('ADMIN', 'SUPERADMIN', 'HR'), removeAssignment);

module.exports = router;
