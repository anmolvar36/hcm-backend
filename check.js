const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      employeeProfile: true
    }
  });
  console.log("USERS WITHOUT PROFILE:");
  users.filter(u => ['EMPLOYEE', 'MANAGER', 'HR'].includes(u.role) && !u.employeeProfile).forEach(u => {
    console.log({
      id: u.id,
      email: u.email,
      role: u.role
    });
  });
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
