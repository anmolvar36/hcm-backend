const { PrismaClient } = require('@prisma/client');
const { processApproval } = require('./src/services/approval.service.js');
const prisma = new PrismaClient();

async function main() {
  try {
    const request = await prisma.salaryIncrementRequest.findFirst({ 
      where: { status: 'Pending', workflowId: { not: null } },
      orderBy: { createdAt: 'desc' }
    });
    
    if (!request) {
      console.log('No pending request found');
      return;
    }

    const currentLog = await prisma.approvalLog.findFirst({
      where: { entityId: request.id, entityType: 'SalaryIncrementRequest', status: 'Pending' },
      include: { approver: true }
    });

    console.log('Current log approver userId:', currentLog.approver.userId);
    
    // Simulate approval by the designated approver
    const result = await processApproval(
      'SalaryIncrementRequest', 
      request.id, 
      currentLog.approver.userId, 
      'APPROVE', 
      'Test'
    );
    console.log('Result:', result);
  } catch (error) {
    console.error('ERROR:', error.stack);
  }
}

main().finally(() => prisma.$disconnect());
