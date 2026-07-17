async function test() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const cals = await prisma.workCalendar.findMany({ include: { versions: { include: { weekends: true } } } });
  console.log(JSON.stringify(cals, null, 2));
}
test().catch(console.error);
