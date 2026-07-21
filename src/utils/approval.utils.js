const prisma = require('../config/prisma');

async function findApproverInHierarchy(startUserId, conditionFn) {
  let currentProfile = await prisma.employeeProfile.findUnique({
    where: { userId: startUserId },
    include: { user: { include: { customRole: true } } }
  });
  
  const visited = new Set();
  
  while (currentProfile && currentProfile.managerId) {
    if (visited.has(currentProfile.managerId)) break;
    visited.add(currentProfile.managerId);
    
    const managerProfile = await prisma.employeeProfile.findUnique({
      where: { id: currentProfile.managerId },
      include: { user: { include: { customRole: true } } }
    });
    
    if (!managerProfile) break;
    
    if (conditionFn(managerProfile)) {
      return managerProfile.id;
    }
    currentProfile = managerProfile;
  }
  return null;
}

/**
 * Resolves dynamic approvers into specific User/Employee profiles based on the step configuration.
 */
const resolveApprover = async (step, requesterUserId, organizationId) => {
  // 1. Specific User
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

  // 2. Custom Role (Traverse Hierarchy)
  if (step.approverType === 'CUSTOM_ROLE') {
    const approverId = await findApproverInHierarchy(requesterUserId, (profile) => {
      return profile.user?.customRole?.name?.toLowerCase() === step.approverRole.toLowerCase();
    });
    if (!approverId) {
      throw new Error(`No manager found in hierarchy with custom role ${step.approverRole}`);
    }
    return approverId;
  }

  // 3. Manager (Traverse Hierarchy for first true MANAGER)
  if (step.approverType === 'MANAGER') {
    const approverId = await findApproverInHierarchy(requesterUserId, (profile) => {
      // Find the first manager whose actual base role is MANAGER or higher (excluding EMPLOYEE)
      // OR who explicitly holds a custom role named 'Manager'.
      const hasManagerBaseRole = ['MANAGER', 'ADMIN', 'HR', 'SUPERADMIN'].includes(profile.user?.role?.toUpperCase());
      const hasManagerCustomRole = profile.user?.customRole?.name?.toLowerCase() === 'manager';
      
      return hasManagerBaseRole || hasManagerCustomRole;
    });

    // Fallback: if no formal MANAGER is found in the chain, just return the direct manager.
    if (!approverId) {
       const requesterProfile = await prisma.employeeProfile.findUnique({
           where: { userId: requesterUserId }
       });
       if (!requesterProfile || !requesterProfile.managerId) {
           throw new Error(`Manager not found for requester.`);
       }
       return requesterProfile.managerId;
    }
    return approverId;
  }

  // 4. Generic Role (Global lookup, e.g. HR)
  if (step.approverType === 'ROLE') {
    let normalizedRole = step.approverRole ? step.approverRole.toUpperCase() : '';
    if (normalizedRole === 'REPORTING MANAGER') normalizedRole = 'MANAGER';
    
    const validRoles = ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE', 'CANDIDATE'];
    
    if (validRoles.includes(normalizedRole)) {
      const user = await prisma.user.findFirst({
        where: { role: normalizedRole, organizationId },
        include: { employeeProfile: true }
      });
      if (user && user.employeeProfile) {
        return user.employeeProfile.id;
      }
    }
    throw new Error(`No user found with generic role ${step.approverRole}`);
  }

  throw new Error(`Unsupported approver type: ${step.approverType}`);
};

module.exports = {
  resolveApprover
};
