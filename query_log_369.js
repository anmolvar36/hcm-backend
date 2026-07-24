const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.approvalLog.findMany({ 
    where: { entityId: '369fcf90-2f45-41ab-b2dc-10d5b1bfbba9' },
    include: { approver: true }
  });
  console.log(JSON.stringify(logs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
