const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const manager = await prisma.user.findFirst({ where: { role: 'MANAGER' } });
  console.log("Manager:", manager.id);
  const managerProfile = await prisma.employeeProfile.findFirst({ where: { userId: manager.id } });
  console.log("Manager Profile:", managerProfile?.id);
  
  if (!managerProfile) {
    console.log("No profile for manager!");
    return;
  }
  
  const claim = await prisma.benefitClaim.findFirst({ 
    where: { employee: { managerId: managerProfile.id } }
  });
  
  console.log("Claim found:", claim?.id);
}

run();
