const prisma = require('./src/config/prisma');

async function run() {
  // These are the employee IDs from previous partial imports that have incomplete data
  // (e.g., fullName set to email username like "rohit.nair" instead of "Rohit Nair")
  const toCheck = ['EMP-006', 'EMP-007', 'EMP-009', 'EMP-010', 'EMP-012'];
  
  const employees = await prisma.employeeProfile.findMany({
    where: { employeeId: { in: toCheck } },
    include: { user: { select: { email: true } } }
  });

  console.log('\n=== CHECKING THESE EXISTING RECORDS ===');
  employees.forEach(emp => {
    console.log(`  ${emp.employeeId} | fullName: "${emp.fullName}" | email: ${emp.user?.email}`);
  });

  console.log('\nDeleting these records so they can be re-imported with correct data...');
  
  for (const emp of employees) {
    try {
      await prisma.compensationProfile.deleteMany({ where: { employeeId: emp.id } });
      await prisma.employeeProfile.delete({ where: { id: emp.id } });
      await prisma.user.delete({ where: { id: emp.userId } });
      console.log(`  ✓ Deleted: ${emp.employeeId} (${emp.fullName})`);
    } catch (e) {
      console.error(`  ✗ Failed to delete ${emp.employeeId}:`, e.message);
    }
  }

  console.log('\nDone! Now import your full 10-row Excel file and all 10 will be imported.');
  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
