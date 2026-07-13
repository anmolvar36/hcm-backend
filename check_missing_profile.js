const prisma = require('./src/config/prisma');

async function run() {
  const users = await prisma.user.findMany({
    include: { employeeProfile: true }
  });
  
  console.log(`\nTotal Users: ${users.length}`);
  const withoutProfile = users.filter(u => !u.employeeProfile && ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'].includes(u.role));
  
  console.log(`Users without profile: ${withoutProfile.length}`);
  withoutProfile.forEach(u => console.log(u.email, u.role));
  
  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
