const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { resolveApprover } = require('./src/utils/approval.utils.js');

async function main() {
  try {
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: { module: 'LeaveRequest', isActive: true, status: 'Active' },
      include: { steps: { orderBy: { sequence: 'asc' } } }
    });
    
    if (!workflow) return console.log('no workflow');
    console.log('workflow steps:', workflow.steps.length);
    
    const firstStep = workflow.steps[0];
    console.log('first step:', firstStep);
    
    const requesterUserId = 'e172c0e6-24b8-4c09-90a8-64ac676dd74a'; // salesemployee's userId
    const orgId = workflow.organizationId;
    
    const approverId = await resolveApprover(firstStep, requesterUserId, orgId);
    console.log('Success! Approver ID:', approverId);
  } catch(err) {
    console.error('FAILED:', err.message);
  }
}

main();
