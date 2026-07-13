const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const exits = await prisma.exitLifecycle.findMany({ include: { employee: true } });
  console.log(JSON.stringify(exits, null, 2));
}
run();
