const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const manager = await prisma.employeeProfile.findFirst({
    where: { employeeId: 'EMP-003' }
  });

  if (!manager) {
    console.log("No manager found with EMP-003");
  } else {
    console.log("Manager EMP-003 Profile ID:", manager.id);
    
    const teamMembers = await prisma.employeeProfile.findMany({
      where: { managerId: manager.id }
    });
    console.log("Team members for EMP-003:", teamMembers.map(t => t.employeeId));
    
    const userIds = teamMembers.map(t => t.userId);
    
    const att = await prisma.attendanceLog.findMany({
      where: { userId: { in: userIds } }
    });
    console.log("Attendance logs for team:", att.length);
  }

  const allAtt = await prisma.attendanceLog.findMany();
  console.log("Total attendance logs in DB:", allAtt.length);
}

main().finally(() => prisma.$disconnect());
