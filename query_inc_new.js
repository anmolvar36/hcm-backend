const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const reqs = await prisma.salaryIncrementRequest.findMany({ 
    orderBy: { createdAt: 'desc' },
    take: 2,
    include: { employee: true }
  });
  console.log(JSON.stringify(reqs, null, 2));

  const log = await prisma.approvalLog.findFirst({
    orderBy: { createdAt: 'desc' },
    take: 1
  });
  console.log(JSON.stringify(log, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
