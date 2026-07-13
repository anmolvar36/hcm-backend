const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function checkTables() {
  const result = await prisma.$queryRawUnsafe('SHOW TABLES;');
  console.log(result);
  await prisma.$disconnect();
}
checkTables().catch(console.error);
