const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employeeProfile.findMany({
    select: { employeeId: true, fullName: true, managerId: true, user: { select: { email: true } } }
  });
  
  const managers = {};
  for (const emp of emps) {
    if (emp.managerId) {
      const mgr = await prisma.employeeProfile.findUnique({ where: { id: emp.managerId } });
      managers[emp.employeeId] = mgr ? mgr.employeeId : 'UNKNOWN';
    } else {
      managers[emp.employeeId] = 'NONE';
    }
    console.log(`${emp.employeeId} (${emp.user?.email}): mgr => ${managers[emp.employeeId]}`);
  }
}

main().finally(() => prisma.$disconnect());
