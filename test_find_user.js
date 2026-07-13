const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const empIds = ['EMP-504', 'EMP-094', 'EMP-C8A', 'EMP-B99', 'EMP-D79'];
  for (const empId of empIds) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: empId },
          { email: empId },
          { employeeProfile: { employeeId: empId } }
        ]
      },
      include: { employeeProfile: true }
    });
    console.log(`Searching for ${empId}: found ${user ? user.email : 'NOT FOUND'}`);
  }
}

main().finally(() => prisma.$disconnect());
