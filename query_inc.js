const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const reqs = await prisma.salaryIncrementRequest.findMany({ 
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(reqs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
