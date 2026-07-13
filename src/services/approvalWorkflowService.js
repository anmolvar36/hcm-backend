const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Initializes an approval workflow for a given entity (e.g. SalaryIncrementRequest).
 * @param {string} organizationId 
 * @param {string} module - The module name (e.g. "SalaryIncrement")
 * @param {string} entityId - The ID of the item requesting approval
 * @returns {object} The workflow log if successful, else throws
 */
const initiateApproval = async (organizationId, module, entityId, requesterId) => {
  // Find active workflow for this module and organization
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { organizationId, module },
    include: { steps: { orderBy: { stepOrder: 'asc' } } }
  });

  if (!workflow || workflow.steps.length === 0) {
    // If no workflow, auto-approve or throw based on business logic. 
    // Here we assume it requires workflow.
    throw new Error(`No approval workflow configured for module: ${module}`);
  }

  // Create initial log for Step 1
  const firstStep = workflow.steps[0];
  
  // We need to resolve WHO the approver is based on the approverRole.
  // In a real system, you'd lookup the actual user (e.g., if role is MANAGER, find requester's manager).
  const requester = await prisma.employeeProfile.findUnique({
    where: { id: requesterId }
  });

  let approverId = null;

  if (firstStep.approverRole === 'MANAGER') {
    approverId = requester.managerId;
  } else {
    // Find first user with that role in org
    // This is a simplification; you'd typically have a mapping or specific user assignments.
    const hrUser = await prisma.user.findFirst({
      where: { organizationId, role: firstStep.approverRole },
      include: { employeeProfile: true }
    });
    approverId = hrUser?.employeeProfile?.id;
  }

  if (!approverId) {
    throw new Error(`Could not resolve approver for role: ${firstStep.approverRole}`);
  }

  const log = await prisma.approvalLog.create({
    data: {
      entityId,
      entityType: module,
      stepOrder: firstStep.stepOrder,
      approverId,
      status: 'Pending'
    }
  });

  return { log, workflow };
};

/**
 * Approves a step in the workflow and advances it to the next step, or finalizes it.
 */
const approveStep = async (logId, approverId, comments = '') => {
  const currentLog = await prisma.approvalLog.findUnique({ where: { id: logId } });
  
  if (!currentLog || currentLog.approverId !== approverId || currentLog.status !== 'Pending') {
    throw new Error("Invalid approval log or unauthorized approver.");
  }

  // Mark current as Approved
  await prisma.approvalLog.update({
    where: { id: logId },
    data: { status: 'Approved', comments }
  });

  // Check if there is a next step
  // To do this, we need to know the workflow. We can find it by finding the workflow that matches the entityType
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: { module: currentLog.entityType },
    include: { steps: { orderBy: { stepOrder: 'asc' } } }
  });

  if (!workflow) throw new Error("Workflow not found");

  const nextStep = workflow.steps.find(s => s.stepOrder > currentLog.stepOrder);

  if (nextStep) {
    // There is a next step, resolve approver
    // Simplification for HR/Admin role resolution:
    const hrUser = await prisma.user.findFirst({
        where: { role: nextStep.approverRole }, // Also needs org ID in real implementation
        include: { employeeProfile: true }
    });
    
    if (hrUser && hrUser.employeeProfile) {
        await prisma.approvalLog.create({
            data: {
              entityId: currentLog.entityId,
              entityType: currentLog.entityType,
              stepOrder: nextStep.stepOrder,
              approverId: hrUser.employeeProfile.id,
              status: 'Pending'
            }
        });
        return { status: 'Advanced', nextStep };
    }
  }

  // If no next step, the workflow is finalized
  return { status: 'Finalized' };
};

module.exports = {
  initiateApproval,
  approveStep
};
