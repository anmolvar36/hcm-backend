const prisma = require('./src/config/prisma');

async function run() {
  // Find all employees with auto-generated IDs (EMP-XXX where XXX looks like hex from UUID)
  const employees = await prisma.employeeProfile.findMany({
    include: { user: true }
  });

  const badPatterns = /^EMP-[A-F0-9]{2,5}$/i;
  const corrupted = employees.filter(emp => badPatterns.test(emp.employeeId));

  console.log(`\nFound ${corrupted.length} employees with auto-generated (corrupted) IDs:\n`);
  corrupted.forEach(emp => {
    console.log(`  employeeId: "${emp.employeeId}" | fullName: "${emp.fullName}" | email: "${emp.user?.email}"`);
  });

  if (corrupted.length === 0) {
    console.log('No corrupted records found. Database is clean.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nDeleting ${corrupted.length} corrupted employee profiles and their user accounts...`);
  
  for (const emp of corrupted) {
    try {
      // Delete compensation profile first (if exists)
      await prisma.compensationProfile.deleteMany({ where: { employeeId: emp.id } });
      // Delete employee profile
      await prisma.employeeProfile.delete({ where: { id: emp.id } });
      // Delete user account
      if (emp.user) {
        await prisma.user.delete({ where: { id: emp.userId } });
      }
      console.log(`  ✓ Deleted: ${emp.employeeId} (${emp.fullName})`);
    } catch (e) {
      console.error(`  ✗ Failed to delete ${emp.employeeId}:`, e.message);
    }
  }

  console.log('\nDone! You can now re-import your Excel file with the correct IDs.');
  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
