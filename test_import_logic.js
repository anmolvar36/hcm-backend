const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { executeImport } = require('./src/services/importService');

async function main() {
  const data = [
    {
      userId: 'EMP-004', // Let's use an employee ID from team EMP-003
      leaveType: 'Casual Leave',
      startDate: '2026-07-09',
      endDate: '2026-07-10',
      totalDays: 2,
      reason: 'Vacation',
      status: 'Pending',
      managerId: 'EMP-003'
    }
  ];

  try {
    const result = await executeImport(data, 'leave', { organizationId: 'org123' });
    console.log("Import success:", result);
  } catch (e) {
    console.error("Import error:", e);
  }

  const leaves = await prisma.leaveRequest.findMany();
  console.log("Total leaves in DB:", leaves.length);
}

main().finally(() => prisma.$disconnect());
