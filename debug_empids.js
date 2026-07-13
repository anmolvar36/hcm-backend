const prisma = require('./src/config/prisma');

async function run() {
  const employees = await prisma.employeeProfile.findMany({
    select: { id: true, employeeId: true, fullName: true, userId: true },
    orderBy: { employeeId: 'asc' }
  });
  
  console.log('\n=== ALL EMPLOYEE IDs ===');
  employees.forEach(emp => {
    console.log(`  employeeId: "${emp.employeeId}" | fullName: "${emp.fullName}" | userId: ${emp.userId}`);
  });
  console.log(`\nTotal: ${employees.length}`);

  // Check for any employeeIds that look auto-generated (random numbers)
  const suspicious = employees.filter(emp => /^EMP-?\d{4,6}$/.test(emp.employeeId) || /^EMP\d{4,6}$/.test(emp.employeeId));
  if (suspicious.length > 0) {
    console.log('\n=== SUSPICIOUS (possibly auto-generated) IDs ===');
    suspicious.forEach(emp => {
      console.log(`  employeeId: "${emp.employeeId}" | fullName: "${emp.fullName}"`);
    });
  }

  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
