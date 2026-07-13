const prisma = require('./src/config/prisma');
const bcrypt = require('bcryptjs');

async function run() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No organization found! Seed the organization first.');
    await prisma.$disconnect();
    return;
  }
  
  const systemUsers = [
    { email: 'admin@hcm.ai', role: 'ADMIN', fullName: 'John Wick', employeeId: 'EMP-001', password: 'admin123' },
    { email: 'hr@hcm.ai', role: 'HR', fullName: 'Sarah Connor', employeeId: 'EMP-002', password: 'hr123' },
    { email: 'manager@hcm.ai', role: 'MANAGER', fullName: 'Alice Cooper', employeeId: 'EMP-003', password: 'manager123' },
    { email: 'employee@hcm.ai', role: 'EMPLOYEE', fullName: 'Bob Marley', employeeId: 'EMP-004', password: 'employee123' },
  ];

  for (const su of systemUsers) {
    try {
      // Check if user already exists
      let user = await prisma.user.findUnique({ where: { email: su.email } });
      
      if (!user) {
        const passwordHash = await bcrypt.hash(su.password, 10);
        user = await prisma.user.create({
          data: {
            email: su.email,
            passwordHash,
            role: su.role,
            isActive: true,
            status: 'Active',
            organizationId: org.id,
          }
        });
        console.log(`✓ Created user: ${su.email}`);
      } else {
        console.log(`→ User already exists: ${su.email}`);
      }
      
      // Check if profile exists
      let profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id } });
      if (!profile) {
        // Check if employeeId is taken
        const existingEmpId = await prisma.employeeProfile.findUnique({ where: { employeeId: su.employeeId } });
        if (existingEmpId) {
          console.warn(`  ⚠ Employee ID ${su.employeeId} already taken, skipping profile creation`);
          continue;
        }
        
        profile = await prisma.employeeProfile.create({
          data: {
            userId: user.id,
            fullName: su.fullName,
            employeeId: su.employeeId,
            employmentType: 'Full-time',
            joiningDate: new Date(),
          }
        });
        console.log(`  ✓ Created profile: ${su.fullName} (${su.employeeId})`);

        // Fetch default salary structure
        const defaultStructure = await prisma.salaryStructure.findFirst({
          where: { organizationId: org.id, isDefault: true }
        }) || await prisma.salaryStructure.findFirst({
          where: { organizationId: org.id }
        });

        await prisma.compensationProfile.create({
          data: {
            employeeId: profile.id,
            monthlyCTC: 0,
            annualCTC: 0,
            effectiveDate: new Date(),
            status: 'Active',
            salaryStructureId: defaultStructure ? defaultStructure.id : null,
            salaryVersionId: defaultStructure ? defaultStructure.currentVersionId : null,
          }
        });
        console.log(`  ✓ Created compensation profile`);
      } else {
        console.log(`  → Profile already exists: ${profile.employeeId}`);
      }
    } catch (e) {
      console.error(`✗ Failed for ${su.email}:`, e.message);
    }
  }
  
  console.log('\nDone! System accounts restored.');
  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
