const express = require('express');
const router = express.Router();
const approvalWorkflowController = require('../controllers/approvalWorkflow.controller');
const { verifyApprover } = require('../middlewares/approval.middleware');
const { protect } = require('../middlewares/authMiddleware');

// Require authentication for all workflow routes
router.use(protect);

// ─────────────────────────────────────────
// Workflow Configuration Routes (Typically Admin/HR only)
// ─────────────────────────────────────────
// NOTE: Should add role-based middleware for these routes in production
router.get('/approval-workflows', approvalWorkflowController.getWorkflows);
router.post('/approval-workflows', approvalWorkflowController.createWorkflow);
router.get('/approval-workflows/module/:module', approvalWorkflowController.getWorkflowByModule);
router.put('/approval-workflows/:id', approvalWorkflowController.updateWorkflow);
router.put('/approval-workflows/:id/unarchive', approvalWorkflowController.unarchiveWorkflow);
router.delete('/approval-workflows/:id', approvalWorkflowController.deleteWorkflow);
router.delete('/approval-workflows/:id/hard', approvalWorkflowController.hardDeleteWorkflow);

// ─────────────────────────────────────────
// Generic Approval Action Routes
// ─────────────────────────────────────────
router.post('/approvals/:module/:entityId/approve', verifyApprover, approvalWorkflowController.approveEntity);
router.post('/approvals/:module/:entityId/reject', verifyApprover, approvalWorkflowController.rejectEntity);
router.get('/approvals/:module/:entityId/timeline', approvalWorkflowController.getTimeline);
router.get('/approvals/:module/:entityId/current-step', approvalWorkflowController.getCurrentStep);
// Fallback for existing history requirement
router.get('/approvals/:module/:entityId/history', approvalWorkflowController.getTimeline);

module.exports = router;
