const prisma = require('./src/config/prisma');

async function run() {
  const toCheck = ['EMP-005', 'EMP-008', 'EMP-011', 'EMP-013', 'EMP-014'];
  const emps = await prisma.employeeProfile.findMany({where: {employeeId: {in: toCheck}}});
  for (const e of emps) {
    await prisma.compensationProfile.deleteMany({where:{employeeId: e.id}});
    await prisma.employeeProfile.delete({where:{id: e.id}});
    await prisma.user.delete({where:{id: e.userId}});
    console.log('Deleted', e.employeeId);
  }
  await prisma.$disconnect();
}
run();
