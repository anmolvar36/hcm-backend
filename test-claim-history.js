const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const claims = await prisma.benefitClaim.findMany({ orderBy: { claimedAt: 'desc' }, take: 1 });
  if (claims.length > 0) {
    console.log(claims[0].approvalHistory);
  }
}
run();
