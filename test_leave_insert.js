const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employeeProfile.findFirst();
  try {
    await prisma.leaveRequest.create({
      data: {
        userId: emp.userId,
        leaveType: 'Sick Leave',
        startDate: new Date(),
        endDate: new Date(),
        totalDays: 1,
        status: 'Pending' // testing mixed case
      }
    });
    console.log("Success");
  } catch (err) {
    console.error("Error inserting:", err.message);
  }
}

main().finally(() => prisma.$disconnect());
