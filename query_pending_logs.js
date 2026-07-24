const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.approvalLog.findMany({ 
    where: { entityType: 'SalaryIncrementRequest', status: 'Pending' },
    include: { approver: { include: { user: true } } }
  });
  console.log(JSON.stringify(logs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
