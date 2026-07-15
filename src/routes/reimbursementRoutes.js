const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');

const {
  getFinalApprovals,
  reviewFinalApproval,
  processPayment
} = require('../controllers/reimbursementController');

// All routes require authentication
router.use(protect);

const { authorize } = require('../middlewares/authMiddleware');

// Get reimbursements pending final approval
router.get('/approvals', authorize('ADMIN', 'SUPERADMIN'), getFinalApprovals);

// Final approve/reject
router.patch('/:id/approve', authorize('ADMIN', 'SUPERADMIN'), reviewFinalApproval);

// Process payment
router.patch('/:id/process-payment', authorize('ADMIN', 'SUPERADMIN'), processPayment);

module.exports = router;
