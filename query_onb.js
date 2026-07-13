const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const emps = await prisma.employeeProfile.findMany();
  console.log('EMPLOYEES:', JSON.stringify(emps, null, 2));
}
run();
