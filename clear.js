const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clear() {
  await prisma.invoice.deleteMany({});
  console.log('Cleared invoices');
}
clear().finally(() => prisma.$disconnect());
