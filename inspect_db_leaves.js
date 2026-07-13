const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const leaves = await prisma.leaveRequest.findMany();
  console.log(`Total leave requests in DB: ${leaves.length}`);
}

main().finally(() => prisma.$disconnect());
