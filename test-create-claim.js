const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const profile = await prisma.employeeProfile.findFirst({ where: { user: { role: 'EMPLOYEE' } } });
  
  const claim = await prisma.benefitClaim.create({
    data: {
      employeeId: profile.id,
      title: 'Test Claim Auto',
      provider: 'Test',
      amount: 100,
      status: 'Pending',
      managerStatus: 'Pending',
      overallStatus: 'Pending Manager Approval',
      approvalHistory: '[]',
      claimedAt: new Date()
    }
  });
  console.log('Created claim:', claim.id, claim.managerStatus, claim.overallStatus);
}
run();
