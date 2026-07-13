const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.attendanceLog.findMany({
    include: { user: { select: { email: true } } }
  });
  console.log("Attendance logs:", logs.map(l => `${l.user.email}: ${l.date}`));
}

main().finally(() => prisma.$disconnect());
