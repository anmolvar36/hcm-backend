const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixUsers() {
  try {
    console.log('Fixing employee statuses...');
    
    // Find Bob Marley
    const bob = await prisma.employeeProfile.findFirst({
      where: { fullName: { contains: 'Bob Marley' } },
      include: { user: true }
    });
    
    if (bob) {
      console.log(`Found Bob. Updating lifecycleStatus to RESIGNED...`);
      await prisma.employeeProfile.update({
        where: { id: bob.id },
        data: { lifecycleStatus: 'RESIGNED' }
      });
      if (bob.user) {
        await prisma.user.update({
          where: { id: bob.userId },
          data: { isActive: false }
        });
      }
    } else {
      console.log('Bob Marley not found in DB');
    }

    // Find Alice Cooper
    const alice = await prisma.employeeProfile.findFirst({
      where: { fullName: { contains: 'Alice Cooper' } },
      include: { user: true }
    });
    
    if (alice) {
      console.log(`Found Alice. Updating lifecycleStatus to TERMINATED...`);
      await prisma.employeeProfile.update({
        where: { id: alice.id },
        data: { lifecycleStatus: 'TERMINATED' }
      });
      if (alice.user) {
        await prisma.user.update({
          where: { id: alice.userId },
          data: { isActive: false }
        });
      }
    } else {
      console.log('Alice Cooper not found in DB');
    }

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixUsers();
