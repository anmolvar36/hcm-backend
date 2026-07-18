const { getCurrentStep } = require('../services/approval.service');

/**
 * Mandatory middleware to intercept generic approval actions and verify permissions.
 * Ensures the requesting user is the exact expected approver for the current workflow step.
 */
const verifyApprover = async (req, res, next) => {
  try {
    const { module, entityId } = req.params;
    const currentUserId = req.user.userId;

    const currentStep = await getCurrentStep(module, entityId);

    if (!currentStep) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No pending approval step found for this entity.' }
      });
    }

    if (currentStep.approver.userId !== currentUserId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not authorized to approve this step.' }
      });
    }

    // Attach step to req for further usage if needed
    req.currentApprovalStep = currentStep;
    next();
  } catch (error) {
    console.error('[Approval Middleware] Error verifying approver:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to verify approver permissions.' }
    });
  }
};

module.exports = {
  verifyApprover
};
