const prisma = require('../config/prisma');

/**
 * Resolves dynamic approvers into specific User/Employee profiles based on the step configuration.
 */
const resolveApprover = async (step, requesterUserId, organizationId) => {
  // If the step designates a specific user
  if (step.approverType === 'SPECIFIC_USER') {
    const user = await prisma.user.findFirst({
      where: { role: step.approverRole, organizationId },
      include: { employeeProfile: true }
    });
    if (!user || !user.employeeProfile) {
      throw new Error(`Specific user with role/identifier ${step.approverRole} not found.`);
    }
    return user.employeeProfile.id;
  }

  // If the step is a generic role
  if (step.approverType === 'ROLE' || step.approverType === 'CUSTOM_ROLE') {
    // Basic logic for phase 1: finding a user with this role
    const user = await prisma.user.findFirst({
      where: { role: step.approverRole, organizationId },
      include: { employeeProfile: true }
    });
    
    if (!user || !user.employeeProfile) {
      throw new Error(`No user found with role ${step.approverRole}`);
    }
    return user.employeeProfile.id;
  }
  
  // Future implementation for MANAGER, etc.
  if (step.approverType === 'MANAGER') {
     const requesterProfile = await prisma.employeeProfile.findUnique({
         where: { userId: requesterUserId }
     });
     if (!requesterProfile || !requesterProfile.managerId) {
         throw new Error(`Manager not found for requester.`);
     }
     return requesterProfile.managerId;
  }

  throw new Error(`Unsupported approver type: ${step.approverType}`);
};

module.exports = {
  resolveApprover
};
