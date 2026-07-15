const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const claims = await prisma.benefitClaim.findMany({ orderBy: { claimedAt: 'desc' }, take: 3 });
  console.log(claims.map(c => ({ id: c.id, managerStatus: c.managerStatus, overallStatus: c.overallStatus, title: c.title })));
}
run();
