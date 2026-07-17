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

router.use(protect, authorize('ADMIN', 'SUPERADMIN'));

router.route('/')
  .get(getAllCalendars)
  .post(createCalendar);

router.route('/:id')
  .get(getCalendarById)
  .put(updateCalendar)
  .delete(deleteCalendar);

router.post('/assign', assignCalendar);
router.delete('/assignments/:id', removeAssignment);

module.exports = router;
