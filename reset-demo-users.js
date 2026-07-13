// Updated reset-demo-users.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetDemoUsers() {
  try {
    console.log('🔄 Resetting demo users...');

    // Alice Cooper (EMP‑003)
    const alice = await prisma.employeeProfile.findFirst({
      where: { fullName: { contains: 'Alice Cooper' } },
      include: { user: true },
    });
    if (alice) {
      await prisma.employeeProfile.update({
        where: { id: alice.id },
        data: { lifecycleStatus: 'ACTIVE' },
      });
      if (alice.user) {
        await prisma.user.update({
          where: { id: alice.userId },
          data: { isActive: true },
        });
      }
    }

    // Bob Marley (EMP‑004)
    const bob = await prisma.employeeProfile.findFirst({
      where: { fullName: { contains: 'Bob Marley' } },
      include: { user: true },
    });
    if (bob) {
      await prisma.employeeProfile.update({
        where: { id: bob.id },
        data: { lifecycleStatus: 'ACTIVE' },
      });
      if (bob.user) {
        await prisma.user.update({
          where: { id: bob.userId },
          data: { isActive: true },
        });
      }
    }

    // Delete any exit/clearance records for these employees
    await prisma.exitLifecycle.deleteMany({
      where: {
        OR: [
          { employeeId: alice?.id },
          { employeeId: bob?.id },
        ],
      },
    });

    console.log('✅ Demo users restored and related exit data removed.');
  } catch (err) {
    console.error('❌ Error resetting demo users:', err);
  } finally {
    await prisma.$disconnect();
  }
}

resetDemoUsers();
