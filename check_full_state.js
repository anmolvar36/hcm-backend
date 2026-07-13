const prisma = require('./src/config/prisma');

async function run() {
  const employees = await prisma.employeeProfile.findMany({
    include: { user: { select: { email: true, role: true } } },
    orderBy: { employeeId: 'asc' }
  });

  console.log('\n=== ALL EMPLOYEES IN DB ===');
  employees.forEach(emp => {
    console.log(`  ${emp.employeeId} | ${emp.fullName} | ${emp.user?.email}`);
  });
  console.log(`\nTotal: ${employees.length}`);

  // Check for users without profiles
  const users = await prisma.user.findMany({
    where: { role: { notIn: ['SUPERADMIN', 'CANDIDATE'] } },
    include: { employeeProfile: true }
  });
  const noProfile = users.filter(u => !u.employeeProfile);
  if (noProfile.length > 0) {
    console.log(`\n=== USERS WITHOUT PROFILE (${noProfile.length}) ===`);
    noProfile.forEach(u => console.log(`  ${u.email} | ${u.role}`));
  } else {
    console.log('\n✓ All users have employee profiles');
  }

  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
