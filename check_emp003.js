const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emp003 = await prisma.employeeProfile.findFirst({
    where: { employeeId: 'EMP-003' }
  });
  console.log("EMP-003:", emp003);

  if (emp003) {
    const team = await prisma.employeeProfile.findMany({
      where: { managerId: emp003.id }
    });
    console.log("Team members count:", team.length);
    console.log("Team members:", team.map(t => t.employeeId).join(', '));
  }

  const attendances = await prisma.attendanceLog.findMany();
  console.log("Total attendance logs:", attendances.length);
  
  const leaves = await prisma.leaveRequest.findMany();
  console.log("Total leaves logs:", leaves.length);
}

main().finally(() => prisma.$disconnect());
