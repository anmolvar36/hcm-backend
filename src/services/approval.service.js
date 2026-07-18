const prisma = require('../config/prisma');
const { resolveApprover } = require('../utils/approval.utils');

/**
 * Checks if a custom workflow is active for a given module and organization.
 */
const isWorkflowEnabled = async (module, organizationId) => {
  try {
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: { module, organizationId, isActive: true, status: 'Active' }
    });
    return !!workflow;
  } catch (error) {
    console.error(`[Approval Engine] Error checking workflow for ${module}:`, error);
    return false; // Fallback to legacy logic on error
  }
};

/**
 * Initiates a workflow for a specific entity.
 */
const startWorkflow = async (module, entityId, organizationId, requesterUserId) => {
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { module, organizationId, isActive: true, status: 'Active' },
    include: { steps: { orderBy: { sequence: 'asc' } } }
  });

  if (!workflow || workflow.steps.length === 0) {
    throw new Error(`No active workflow found for module: ${module}`);
  }

  const firstStep = workflow.steps[0];
  const approverId = await resolveApprover(firstStep, requesterUserId, organizationId);
  const nextStepSequence = workflow.steps.length > 1 ? workflow.steps[1].sequence : null;

  const log = await prisma.approvalLog.create({
    data: {
      entityId,
      entityType: module,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      stepOrder: firstStep.sequence,
      nextStep: nextStepSequence,
      approverId,
      status: 'Pending'
    }
  });

  // Also log to AuditLog
  await prisma.auditLog.create({
    data: {
      userId: requesterUserId,
      action: 'WORKFLOW_STARTED',
      details: `Started workflow for ${module} (Entity ID: ${entityId})`,
      ipAddress: 'System Workflow'
    }
  });

  return log;
};

/**
 * Processes an approval or rejection.
 */
const processApproval = async (module, entityId, approverUserId, action, comments = '') => {
  const currentLog = await prisma.approvalLog.findFirst({
    where: { entityId, entityType: module, status: 'Pending' },
    orderBy: { createdAt: 'desc' },
    include: { approver: true }
  });

  if (!currentLog) {
    throw new Error("No pending approval found for this entity.");
  }

  // Fetch user to check role bypass
  const user = await prisma.user.findUnique({ where: { id: approverUserId } });
  
  // Final check: must be the exact designated approver, OR an Admin/Superadmin/HR
  if (currentLog.approver.userId !== approverUserId && !['SUPERADMIN', 'ADMIN', 'HR'].includes(user?.role)) {
    throw new Error("Unauthorized approver.");
  }

  const newStatus = action === 'APPROVE' ? 'Approved' : 'Rejected';

  await prisma.approvalLog.update({
    where: { id: currentLog.id },
    data: { status: newStatus, comments }
  });

  await prisma.auditLog.create({
    data: {
      userId: approverUserId,
      action: `WORKFLOW_STEP_${action}`,
      details: `Step ${currentLog.stepOrder} ${newStatus} for ${module} (Entity: ${entityId})`,
      ipAddress: 'System Workflow'
    }
  });

  if (action === 'REJECT') {
    return { status: 'Rejected', finalized: true };
  }

  // If approved, evaluate the next step dynamically
  const workflow = await prisma.approvalWorkflow.findUnique({
    where: { id: currentLog.workflowId },
    include: { steps: true }
  });

  const sortedSteps = workflow.steps.sort((a, b) => a.sequence - b.sequence);
  const nextStepConfig = sortedSteps.find(s => s.sequence > currentLog.stepOrder);

  if (nextStepConfig) {
    // We need the original requester userId to resolve context
    // For Phase 1 we pass approverUserId as a fallback
    const nextApproverId = await resolveApprover(nextStepConfig, approverUserId, workflow.organizationId);

    const nextNextStepConfig = sortedSteps.find(s => s.sequence > nextStepConfig.sequence);
    const nextNextStepSeq = nextNextStepConfig ? nextNextStepConfig.sequence : null;

    await prisma.approvalLog.create({
      data: {
        entityId,
        entityType: module,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        stepOrder: nextStepConfig.sequence,
        previousStep: currentLog.stepOrder,
        nextStep: nextNextStepSeq,
        approverId: nextApproverId,
        status: 'Pending'
      }
    });

    return { status: 'Advanced', finalized: false };
  }

  return { status: 'Finalized', finalized: true };
};

const getApprovalHistory = async (module, entityId) => {
  return await prisma.approvalLog.findMany({
    where: { entityId, entityType: module },
    orderBy: { createdAt: 'asc' },
    include: { approver: { select: { fullName: true, employeeId: true } } }
  });
};

const getCurrentStep = async (module, entityId) => {
  return await prisma.approvalLog.findFirst({
    where: { entityId, entityType: module, status: 'Pending' },
    orderBy: { createdAt: 'desc' },
    include: { approver: { select: { fullName: true, userId: true } } }
  });
};

module.exports = {
  isWorkflowEnabled,
  startWorkflow,
  processApproval,
  getApprovalHistory,
  getCurrentStep
};
