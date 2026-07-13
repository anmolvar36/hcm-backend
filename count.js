const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.payslip.count().then(c => {
  console.log('Payslips count:', c);
}).catch(console.error).finally(() => prisma.$disconnect());
